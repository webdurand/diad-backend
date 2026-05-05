import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { LocationEntity } from "src/entities/location.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import {
  GameSessionEntity,
  SessionTravelState,
} from "src/entities/game-session.entity";
import { StoryArcEntity } from "src/entities/story-arc.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { NpcRelationshipEntity } from "src/entities/npc-relationship.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { In } from "typeorm";
import { EventLogService } from "./event-log.service";
import { ChronicleService } from "./chronicle.service";
import { SceneContextCacheService } from "./scene-context-cache.service";
import { PcPersonaService } from "src/models/characters/services/pc-persona.service";
import { PCPersona } from "src/models/characters/dto/pc-persona.dto";

/**
 * Assembles the 5-tier context for AI integration.
 * This is the single entry point the AI Narrator will call.
 */
export interface SceneContext {
  // Tier 1: Current scene
  scene: {
    title?: string;
    description?: string;
    mood?: string;
    location?: {
      name: string;
      type: string;
      description?: string;
      atmosphere?: string;
    };
  };
  npcsPresent: Array<{
    /**
     * Spec 026 Pillar 1+4 — UUID do NpcEntity. Sem `id`, PreFlightOracle
     * Camada 0 não conseguia resolver targets de ataque e caía pra Haiku
     * silenciosamente; ataques a NPCs neutros viravam diálogo dramático
     * em vez de combate (RAW: declaração hostil = encounter sempre).
     */
    id: string;
    name: string;
    title?: string;
    race?: string;
    disposition: string;
    personalityBig5: Record<string, number>;
    motivation?: string;
    knowledgeScope: string[];
    dialogueStyle?: string;
  }>;

  // Tier 2: Recent session events
  recentEvents: Array<{
    eventType: string;
    summary: string;
    sequence: number;
  }>;

  // Tier 3: Party knowledge (filtered by relevance)
  partyKnowledge: Array<{
    entityType: string;
    knowledgeKey: string;
    knowledgeValue?: string;
  }>;

  // Tier 4: World lore
  locationChain: Array<{ name: string; type: string; description?: string }>;
  worldLore?: string;

  // Tier 5: Chronicle
  recentChronicles: Array<{
    title: string;
    content: string;
    significance: number;
  }>;

  // Story arc pacing
  storyArc?: {
    name: string;
    currentPhase: string;
    phaseNotes: Record<string, string>;
  };

  // Spec 018 — PC Persona block. Null em sessions multi-PC ou sem PC resolvido.
  playerCharacter?: PCPersona | null;

  availableLocations: Array<{
    connectionId: string;
    toLocationId: string;
    toLocationName: string;
    toLocationType: string;
    travelTime: string | null;
    description: string | null;
    isLocked: boolean;
  }>;

  travelState?: SessionTravelState | null;
}

@Injectable()
export class SceneContextService {
  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneNpcEntity)
    private readonly sceneNpcRepo: Repository<SceneNpcEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(LocationConnectionEntity)
    private readonly connectionRepo: Repository<LocationConnectionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(StoryArcEntity)
    private readonly arcRepo: Repository<StoryArcEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(NpcRelationshipEntity)
    private readonly relRepo: Repository<NpcRelationshipEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly arcStateRepo: Repository<SessionStoryArcStateEntity>,
    private readonly eventLogService: EventLogService,
    private readonly chronicleService: ChronicleService,
    private readonly pcPersonaService: PcPersonaService,
    private readonly cache: SceneContextCacheService,
  ) {}

  async assembleContext(sceneId: string): Promise<SceneContext> {
    const cached = this.cache.get(sceneId);
    if (cached) return cached;
    const ctx = await this.assembleContextUncached(sceneId);
    this.cache.set(sceneId, ctx);
    return ctx;
  }

  private async assembleContextUncached(sceneId: string): Promise<SceneContext> {
    const scene = await this.sceneRepo.findOne({
      where: { id: sceneId },
      relations: ["location", "session"],
    });
    if (!scene) {
      return this.emptyContext();
    }

    const session = await this.sessionRepo.findOne({
      where: { id: scene.sessionId },
    });

    // We need the campaignId — for now get it from session config or location
    // In V1 sessions aren't tied to campaigns yet. Return what we can.
    const campaignId = scene.location?.campaignId;

    // Tier 1: Scene + NPCs
    const sceneNpcs = await this.sceneNpcRepo.find({
      where: { sceneId },
      relations: ["npc"],
    });

    const presentNpcIds = sceneNpcs
      .filter((sn) => sn.npc)
      .map((sn) => sn.npc.id);
    const npcStates =
      presentNpcIds.length > 0
        ? await this.npcStateRepo.find({
            where: { gameSessionId: scene.sessionId, npcId: In(presentNpcIds) },
          })
        : [];
    const dispositionByNpc = new Map(
      npcStates.map((s) => [s.npcId, s.disposition]),
    );

    const npcsPresent = sceneNpcs
      .filter((sn) => sn.npc)
      .map((sn) => ({
        id: sn.npc.id,
        name: sn.npc.name,
        title: sn.npc.title,
        race: sn.npc.race,
        disposition: dispositionByNpc.get(sn.npc.id) ?? "neutral",
        personalityBig5: sn.npc.personalityBig5 as Record<string, number>,
        motivation: sn.npc.motivation,
        knowledgeScope: sn.npc.knowledgeScope,
        dialogueStyle: sn.npc.dialogueStyle,
      }));

    // Tier 2: Recent events
    const events = await this.eventLogService.getRecentEvents(
      scene.sessionId,
      25,
    );
    const recentEvents = events.reverse().map((e) => ({
      eventType: e.eventType,
      summary: e.summary,
      sequence: e.sequence,
    }));

    // Tier 3: Party knowledge
    let partyKnowledge: SceneContext["partyKnowledge"] = [];
    if (campaignId) {
      const npcIds = sceneNpcs.map((sn) => sn.npcId);
      const knowledge = await this.chronicleService.getRelevantKnowledge(
        campaignId,
        { locationId: scene.locationId, npcIds },
      );
      partyKnowledge = knowledge.map((k) => ({
        entityType: k.entityType,
        knowledgeKey: k.knowledgeKey,
        knowledgeValue: k.knowledgeValue,
      }));
    }

    // Tier 4: Location chain + world lore
    const locationChain = await this.getLocationChain(scene.locationId);
    let worldLore: string | undefined;
    if (campaignId) {
      const campaign = await this.campaignRepo.findOne({
        where: { id: campaignId },
      });
      worldLore = campaign?.worldLore ?? undefined;
    }

    // Tier 5: Chronicles
    let recentChronicles: SceneContext["recentChronicles"] = [];
    if (campaignId) {
      const chronicles = await this.chronicleService.getChronicles(
        campaignId,
        5,
        3,
      );
      recentChronicles = chronicles.map((c) => ({
        title: c.title,
        content: c.content,
        significance: c.significance,
      }));
    }

    // Story arc — template no Campaign, progresso na ponte session_story_arc_state.
    let storyArc: SceneContext["storyArc"];
    if (campaignId) {
      const arc = await this.arcRepo.findOne({
        where: { campaignId, isActive: true, isMainArc: true },
      });
      if (arc) {
        const arcState = await this.arcStateRepo.findOne({
          where: { gameSessionId: scene.sessionId, storyArcId: arc.id },
        });
        storyArc = {
          name: arc.name,
          currentPhase: arcState?.currentPhase ?? "hook",
          phaseNotes: arcState?.phaseNotes ?? {},
        };
      }
    }

    let availableLocations: SceneContext["availableLocations"] = [];
    if (scene.locationId) {
      const connections = await this.connectionRepo.find({
        where: { fromLocationId: scene.locationId, isHidden: false },
        relations: ["toLocation"],
      });
      availableLocations = connections.map((c) => ({
        connectionId: c.id,
        toLocationId: c.toLocationId,
        toLocationName: c.toLocation?.name ?? "(?)",
        toLocationType: c.toLocation?.type ?? "unknown",
        travelTime: c.travelTime ?? null,
        description: c.description ?? null,
        isLocked: c.isLocked,
      }));
    }

    const travelState = session?.travelState ?? null;

    // Spec 018 — bloco PC. Solo flow: 1 PC por session em characterIds[0].
    // Multi-PC ou sem PC → playerCharacter: null (DM prompt cobre o caso).
    let playerCharacter: PCPersona | null = null;
    const characterIds = session?.characterIds ?? [];
    if (characterIds.length === 1) {
      try {
        playerCharacter = await this.pcPersonaService.assemblePersona(
          characterIds[0],
          null, // contexto interno — auth já passou no SessionController guard.
        );
      } catch {
        // Persona indisponível → seguir sem ela. Spec 018 §Riscos: backwards
        // compat — clients V1 ignoram playerCharacter (additive).
        playerCharacter = null;
      }
    }

    return {
      scene: {
        title: scene.title,
        description: scene.description,
        mood: scene.mood,
        location: scene.location
          ? {
              name: scene.location.name,
              type: scene.location.type,
              description: scene.location.description,
              atmosphere: scene.location.atmosphere,
            }
          : undefined,
      },
      npcsPresent,
      recentEvents,
      partyKnowledge,
      locationChain,
      worldLore,
      recentChronicles,
      storyArc,
      playerCharacter,
      availableLocations,
      travelState,
    };
  }

  private async getLocationChain(
    locationId?: string,
  ): Promise<Array<{ name: string; type: string; description?: string }>> {
    if (!locationId) return [];

    // Recursive CTE — uma query única ao invés de N findOne sequenciais.
    // Ordem: raiz primeiro (depth DESC), bate o unshift do loop antigo.
    const rows: Array<{
      name: string;
      type: string;
      description: string | null;
      depth: number;
    }> = await this.locationRepo.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, name, type, description, 0 AS depth
         FROM locations WHERE id = $1
         UNION ALL
         SELECT l.id, l.parent_id, l.name, l.type, l.description, c.depth + 1
         FROM locations l
         JOIN chain c ON l.id = c.parent_id
       )
       SELECT name, type, description, depth FROM chain ORDER BY depth DESC`,
      [locationId],
    );

    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      description: r.description ?? undefined,
    }));
  }

  private emptyContext(): SceneContext {
    return {
      scene: {},
      npcsPresent: [],
      recentEvents: [],
      partyKnowledge: [],
      locationChain: [],
      recentChronicles: [],
      playerCharacter: null,
      availableLocations: [],
      travelState: null,
    };
  }
}
