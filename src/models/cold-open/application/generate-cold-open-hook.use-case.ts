import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { In, Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { LocationEntity } from "src/entities/location.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { OpeningArchetypeEntity } from "src/entities/opening-archetype.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import type { EventAudience } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { PcPersonaService } from "src/models/characters/services/pc-persona.service";
import type { PCPersona } from "src/models/characters/dto/pc-persona.dto";
import {
  rankArchetypes,
  selectArchetype,
} from "../domain/archetype-selector";
import { OPENING_ARCHETYPES } from "../domain/opening-archetype-catalog";
import type {
  ColdOpenHookSnapshot,
  OpeningArchetype,
  SlotResolutionContext,
} from "../domain/opening-archetype.types";
import {
  renderPromptShape,
  resolveInitialFocalNpc,
  resolveSlotsForRankedCandidates,
} from "../domain/opening-slot-resolver";
import { extractPcTags } from "../domain/pc-tag-extractor";

const COLD_OPEN_AUDIENCES: EventAudience[] = [
  "Narrator",
  "Director",
  "HUD",
  "Archivist",
];

@Injectable()
export class GenerateColdOpenHookUseCase {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(OpeningArchetypeEntity)
    private readonly archetypeRepo: Repository<OpeningArchetypeEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    private readonly pcPersonaService: PcPersonaService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(GenerateColdOpenHookUseCase.name);
  }

  async execute(scene: SceneEntity): Promise<ColdOpenHookSnapshot | null> {
    if (scene.sceneNumber !== 1) return null;

    const session = await this.sessionRepo.findOne({
      where: { id: scene.sessionId },
    });
    if (!session?.campaignId || session.characterIds.length !== 1) return null;

    const campaign = await this.campaignRepo.findOne({
      where: { id: session.campaignId },
    });
    if (!campaign) return null;

    const persona = await this.pcPersonaService.assemblePersona(
      session.characterIds[0],
      null,
    );
    const archetypes = await this.loadActiveArchetypes();
    const seed = createSeed(scene.sessionId);
    const pcTags = extractPcTags(persona);
    const voiceProfile = resolveVoiceProfile(campaign);
    const recentArchetypeKeys = await this.loadRecentArchetypeKeys(
      campaign.id,
      scene.id,
    );
    const storyTags = extractStoryTags(campaign.generationSeed);

    const selection = selectArchetype({
      archetypes,
      seed,
      pcTags,
      voiceProfile,
      recentArchetypeKeys,
      storyTags,
    });

    const ranked = rankArchetypes({
      archetypes,
      seed,
      pcTags,
      voiceProfile,
      recentArchetypeKeys,
      storyTags,
    })
      .filter((item) => item.rejectedReason === null)
      .map((item) => item.archetype);
    const resolutionOrder = [
      selection.selected,
      ...ranked.filter((archetype) => archetype.key !== selection.selected.key),
    ];

    const context = await this.buildSlotContext(scene, session, campaign, persona);
    const resolved =
      resolveSlotsForRankedCandidates(resolutionOrder, context) ??
      resolveSlotsForRankedCandidates(ranked, context);
    if (!resolved) return null;

    const openingLineDraft = renderPromptShape(
      resolved.archetype.promptShape,
      resolved.slots,
    ).slice(0, 280);
    const initialFocalNpc = resolved.archetype.opensInDialogue
      ? resolveInitialFocalNpc(resolved.archetype.initialFocalNpcSlot, context)
      : null;
    const hook: ColdOpenHookSnapshot = {
      archetypeKey: resolved.archetype.key,
      seed,
      slots: resolved.slots,
      generatedAt: new Date().toISOString(),
      openingLineDraft,
      initialFocalNpcId: initialFocalNpc?.id ?? null,
      initialFocalNpcSlot: resolved.archetype.initialFocalNpcSlot ?? null,
      scoringTrace: {
        candidates: selection.ranked.map((item) => ({
          key: item.archetype.key,
          score: Number.isFinite(item.score)
            ? Number(item.score.toFixed(4))
            : -999,
          rejectedReason: item.rejectedReason,
        })),
        selected: resolved.archetype.key,
        pcTags,
        voiceProfile,
        antiRepeatRejected: selection.antiRepeatRejected,
      },
    };

    scene.coldOpenHook = hook;
    await this.sceneRepo.save(scene);
    await this.publishGeneratedEvent({
      scene,
      campaign,
      session,
      characterId: persona.characterId,
      hook,
      voiceProfile,
      mainQuestId: context.activeQuest?.id ?? null,
      archetype: resolved.archetype,
    });
    return hook;
  }

  private async loadActiveArchetypes(): Promise<OpeningArchetype[]> {
    const rows = await this.archetypeRepo.find({ where: { isActive: true } });
    if (rows.length === 0) return OPENING_ARCHETYPES;
    return rows.map((row) => ({
      key: row.key,
      displayName: row.displayName,
      promptShape: row.promptShape,
      requiredSlots: row.requiredSlots ?? [],
      optionalSlots: row.optionalSlots ?? [],
      bannedPhrases: row.bannedPhrases ?? [],
      requiredVoiceProfiles: row.requiredVoiceProfiles ?? [],
      compatiblePcTags: row.compatiblePcTags ?? [],
      incompatiblePcTags: row.incompatiblePcTags ?? [],
      emotionalArc: row.emotionalArc,
      weightDefault: row.weightDefault,
      fewShotExample: row.fewShotExample ?? null,
      isActive: row.isActive,
      since: row.since,
      opensInDialogue: row.opensInDialogue === true,
      initialFocalNpcSlot: row.initialFocalNpcSlot ?? null,
    }));
  }

  private async loadRecentArchetypeKeys(
    campaignId: string,
    currentSceneId: string,
  ): Promise<string[]> {
    try {
      const rows = await this.sceneRepo
        .createQueryBuilder("scene")
        .innerJoin(GameSessionEntity, "session", "session.id = scene.session_id")
        .where("session.campaign_id = :campaignId", { campaignId })
        .andWhere("scene.id != :currentSceneId", { currentSceneId })
        .andWhere("scene.cold_open_hook IS NOT NULL")
        .orderBy("scene.started_at", "DESC")
        .limit(3)
        .getMany();
      return rows
        .map((row) => row.coldOpenHook?.archetypeKey)
        .filter((key): key is string => typeof key === "string");
    } catch {
      return [];
    }
  }

  private async buildSlotContext(
    scene: SceneEntity,
    session: GameSessionEntity,
    campaign: CampaignEntity,
    persona: PCPersona,
  ): Promise<SlotResolutionContext> {
    const [location, npcs, quest] = await Promise.all([
      scene.locationId
        ? this.locationRepo.findOne({ where: { id: scene.locationId } })
        : Promise.resolve(null),
      this.npcRepo.find({ where: { campaignId: campaign.id }, take: 10 }),
      this.questRepo.findOne({
        where: {
          gameSessionId: session.id,
          isMainQuest: true,
          status: In<QuestEntity["status"]>(["active", "available"]),
        },
        relations: ["objectives"],
      }),
    ]);
    const activeObjective = selectActiveObjective(quest);

    return {
      pc: {
        name: persona.name,
        race: persona.race,
        class: persona.class,
      },
      npcs: npcs.map((npc) => ({
        id: npc.id,
        name: npc.name,
        title: npc.title,
        race: npc.race,
        description: npc.description,
        motivation: npc.motivation,
      })),
      locations: location
        ? [
            {
              name: location.name,
              type: location.type,
              atmosphere: location.atmosphere,
              description: location.description,
            },
          ]
        : [],
      activeQuest: quest
        ? {
            id: quest.id,
            name: quest.name,
            activeObjective,
          }
        : null,
    };
  }

  private async publishGeneratedEvent(input: {
    scene: SceneEntity;
    campaign: CampaignEntity;
    session: GameSessionEntity;
    characterId: string;
    hook: ColdOpenHookSnapshot;
    voiceProfile: string;
    mainQuestId: string | null;
    archetype: OpeningArchetype;
  }): Promise<void> {
    const envelope = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType: "cold_open_generated",
      source: {
        service: "diad-backend",
        module: "GenerateColdOpenHookUseCase.execute",
      },
      scope: {
        campaignId: input.campaign.id,
        sessionId: input.session.id,
        sceneId: input.scene.id,
      },
      audiences: COLD_OPEN_AUDIENCES,
      narrativeDescriptor: `Cold open '${input.archetype.displayName}' selecionado para ${
        input.hook.slots["pc.name"] ?? "PC"
      }`.slice(0, 120),
      payload: {
        sessionId: input.session.id,
        sceneId: input.scene.id,
        campaignId: input.campaign.id,
        characterId: input.characterId,
        archetypeKey: input.hook.archetypeKey,
        voiceProfile: input.voiceProfile,
        slots: input.hook.slots,
        seed: input.hook.seed,
        openingLineDraft: input.hook.openingLineDraft,
        initialFocalNpcId: input.hook.initialFocalNpcId ?? null,
        initialFocalNpcSlot: input.hook.initialFocalNpcSlot ?? null,
        mainQuestId: input.mainQuestId,
      },
      metadata: {
        tags: ["narrative", "cold_open", "session_start"],
        narrativeWeight: 9,
      },
    });

    await this.eventBus.publish(envelope);
  }
}

function createSeed(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

function resolveVoiceProfile(campaign: CampaignEntity): string {
  const tonal = campaign.tonalAnchor ?? {};
  return tonal.narratorVoice ?? "heroic-high-fantasy";
}

function extractStoryTags(
  generationSeed: Record<string, unknown> | undefined,
): string[] {
  const storySeed = generationSeed?.storySeed;
  if (!storySeed || typeof storySeed !== "object" || Array.isArray(storySeed)) {
    return [];
  }
  const text = Object.values(storySeed as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const tags: string[] = [];
  if (/mentor|mestre/.test(text)) tags.push("bond:mentor");
  if (/myst|mist[eé]rio|segredo|secret/.test(text)) tags.push("scholar");
  if (/d[ií]vida|debt/.test(text)) tags.push("background:criminal");
  if (/reden|redemption/.test(text)) tags.push("ideal:redemption");
  return tags;
}

function selectActiveObjective(quest: QuestEntity | null): string | null {
  const objectives = quest?.objectives ?? [];
  const active = objectives
    .filter((objective) => objective.status === "active")
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )[0];
  return active?.description ?? null;
}
