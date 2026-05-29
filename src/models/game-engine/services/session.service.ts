import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { LocationEntity } from "src/entities/location.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { FactionEntity } from "src/entities/faction.entity";
import { SceneService } from "src/models/session/services/scene.service";
import { QuestService } from "src/models/world/services/quest.service";
import type { CreateQuestDto } from "src/models/world/services/quest.service";
import { PhaseService } from "src/models/world/services/phase.service";
import { SessionNpcStateService } from "src/models/world/services/session-npc-state.service";
import { LocationPoiService } from "src/models/world/services/location-poi.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

const STARTING_LOCATION_TYPE_PRIORITY: Record<string, number> = {
  city: 1,
  region: 2,
  wilderness: 3,
  building: 4,
  continent: 5,
  dungeon: 6,
  district: 7,
  room: 8,
  dungeon_room: 9,
};

const SESSION_ACCESS_CACHE_TTL_MS = 5_000;

interface SessionAccessCacheEntry {
  session: GameSessionEntity;
  expiresAt: number;
}

export interface CreateSessionDto {
  name: string;
  campaignId?: string;
  config?: {
    dice_seed?: number;
    critical_variant?: "double_dice" | "double_damage";
    bimodalLoopEnabled?: boolean;
    idleLoopEnabled?: boolean;
    hubPoiEnabled?: boolean;
  };
}

export interface UpdateSessionDto {
  name?: string;
  status?: "lobby" | "active" | "paused" | "completed";
  activeEncounterId?: string | null;
  scene?: {
    name?: string;
    description?: string;
    environment?: string;
  };
}

@Injectable()
export class SessionService {
  private readonly accessCache = new Map<string, SessionAccessCacheEntry>();

  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(CampaignPlayerEntity)
    private readonly campaignPlayerRepo: Repository<CampaignPlayerEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(FactionEntity)
    private readonly factionRepo: Repository<FactionEntity>,
    private readonly sceneService: SceneService,
    private readonly questService: QuestService,
    private readonly phaseService: PhaseService,
    private readonly sessionNpcStateService: SessionNpcStateService,
    private readonly poiService: LocationPoiService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(SessionService.name);
  }

  async create(
    ownerId: string,
    dto: CreateSessionDto,
  ): Promise<GameSessionEntity> {
    let campaign: CampaignEntity | null = null;
    if (dto.campaignId) {
      campaign = await this.campaignRepo.findOne({
        where: { id: dto.campaignId },
      });
      if (!campaign) {
        throw new NotFoundException({
          ok: false,
          code: "CAMPAIGN_NOT_FOUND",
          error:
            "Mundo nao existe mais. Pode ter sido apagado — recarregue a tela e selecione um mundo da lista atualizada.",
        });
      }
    }

    const session = this.sessionRepo.create({
      name: dto.name,
      ownerId,
      campaignId: dto.campaignId ?? undefined,
      status: "lobby",
      characterIds: [],
      scene: {},
      config: {
        bimodalLoopEnabled: true,
        idleLoopEnabled: true,
        hubPoiEnabled: true,
        ...(dto.config ?? {}),
      },
    });
    const saved = await this.sessionRepo.save(session);

    if (campaign) {
      await this.initializeCanonicalNpcStates(saved.id, campaign.id);
      await this.bootstrapInitialScene(saved.id, campaign);
      await this.materializeQuestsFromTemplate(saved.id, campaign);
      if (this.isStoryFirstCampaign(campaign)) {
        await this.phaseService.bootstrapStoryFirst(saved.id, campaign);
      }
    }

    return saved;
  }

  private isStoryFirstCampaign(campaign: CampaignEntity): boolean {
    const seed = campaign.generationSeed ?? {};
    const userInputs =
      seed.userInputs && typeof seed.userInputs === "object"
        ? (seed.userInputs as Record<string, unknown>)
        : {};
    const aiAdditions =
      seed.aiAdditions && typeof seed.aiAdditions === "object"
        ? (seed.aiAdditions as Record<string, unknown>)
        : {};
    return (
      seed.storyFirstEnabled === true ||
      typeof seed.storySeed === "object" ||
      typeof seed.story_arc === "object" ||
      typeof seed.storyArc === "object" ||
      Array.isArray(seed.quests) ||
      Array.isArray(seed.questsTemplate) ||
      typeof userInputs.story_arc === "object" ||
      typeof userInputs.storyArc === "object" ||
      Array.isArray(userInputs.quests) ||
      Array.isArray(userInputs.questsTemplate) ||
      typeof aiAdditions.story_arc === "object" ||
      typeof aiAdditions.storyArc === "object" ||
      Array.isArray(aiAdditions.quests) ||
      Array.isArray(aiAdditions.questsTemplate)
    );
  }

  private async initializeCanonicalNpcStates(
    sessionId: string,
    campaignId: string,
  ): Promise<void> {
    try {
      const npcs = await this.npcRepo.find({
        where: { campaignId, gameSessionId: IsNull() },
        select: ["id", "homeLocationId", "homePoiId"],
      });
      if (npcs.length === 0) return;

      const existing = await this.npcStateRepo.find({
        where: { gameSessionId: sessionId },
        select: ["npcId"],
      });
      const existingIds = new Set(existing.map((s) => s.npcId));

      // Spec 047: quando home_poi_id é null mas home_location_id existe (mundos
      // gerados antes da atribuição de POI, ou cujo seed só definiu a location),
      // caímos no POI default da home_location. Sem isso, currentPoiId fica null,
      // listByPoi nunca encontra o NPC e a cena nasce vazia (figurantes anônimos
      // com [FALA] inline). Memoiza por location → 1 chamada por location.
      const defaultPoiByLocation = new Map<string, string | null>();
      const resolveCurrentPoiId = async (
        npc: Pick<NpcEntity, "homeLocationId" | "homePoiId">,
      ): Promise<string | undefined> => {
        if (npc.homePoiId) return npc.homePoiId;
        if (!npc.homeLocationId) return undefined;
        if (!defaultPoiByLocation.has(npc.homeLocationId)) {
          try {
            const poi = await this.poiService.ensureDefaultForLocation(
              campaignId,
              npc.homeLocationId,
            );
            defaultPoiByLocation.set(npc.homeLocationId, poi.id);
          } catch {
            defaultPoiByLocation.set(npc.homeLocationId, null);
          }
        }
        return defaultPoiByLocation.get(npc.homeLocationId) ?? undefined;
      };

      const states: SessionNpcStateEntity[] = [];
      for (const npc of npcs) {
        if (existingIds.has(npc.id)) continue;
        states.push(
          this.npcStateRepo.create({
            gameSessionId: sessionId,
            npcId: npc.id,
            status: "alive",
            disposition: "neutral",
            currentLocationId: npc.homeLocationId,
            currentPoiId: await resolveCurrentPoiId(npc),
          }),
        );
      }
      if (states.length > 0) await this.npcStateRepo.save(states);
    } catch (err) {
      this.logger.warn("session.initialize_canonical_npc_states.failed", {
        "session.id": sessionId,
        "campaign.id": campaignId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async bootstrapInitialScene(
    sessionId: string,
    campaign: CampaignEntity,
  ): Promise<void> {
    try {
      if (!campaign.startingLocationId) {
        const inferred = await this.inferStartingLocation(campaign.id);
        if (inferred) {
          campaign.startingLocationId = inferred;
          await this.campaignRepo.save(campaign);
        }
      }

      const scene = await this.sceneService.create(sessionId, {
        locationId: campaign.startingLocationId ?? undefined,
        title: campaign.name,
        reason: "session_bootstrap",
        skipBudgetIncrement: true,
      });
      if (scene.poiId) {
        await this.populateSceneNpcsFromPoi(sessionId, scene.id, scene.poiId);
      }
    } catch (err) {
      this.logger.warn("session.bootstrap_initial_scene.failed", {
        "session.id": sessionId,
        "campaign.id": campaign.id,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async populateSceneNpcsFromPoi(
    sessionId: string,
    sceneId: string,
    poiId: string,
  ): Promise<void> {
    const [states, existingSceneNpcs] = await Promise.all([
      this.sessionNpcStateService.listByPoi(sessionId, poiId),
      this.sceneService.getSceneNpcs(sceneId),
    ]);
    const existingNpcIds = new Set(existingSceneNpcs.map((npc) => npc.npcId));
    for (const state of states) {
      if (state.status !== "alive") continue;
      if (existingNpcIds.has(state.npcId)) continue;
      await this.sceneService.addNpcToScene(sceneId, state.npcId, "present");
      existingNpcIds.add(state.npcId);
    }
  }

  private async materializeQuestsFromTemplate(
    sessionId: string,
    campaign: CampaignEntity,
  ): Promise<void> {
    const seed = campaign.generationSeed ?? {};
    const userInputs =
      seed.userInputs && typeof seed.userInputs === "object"
        ? (seed.userInputs as Record<string, unknown>)
        : {};
    const aiAdditions =
      seed.aiAdditions && typeof seed.aiAdditions === "object"
        ? (seed.aiAdditions as Record<string, unknown>)
        : {};
    const template = Array.isArray(seed.questsTemplate)
      ? seed.questsTemplate
      : Array.isArray(seed.quests)
        ? seed.quests
        : Array.isArray(userInputs.questsTemplate)
          ? userInputs.questsTemplate
          : Array.isArray(userInputs.quests)
            ? userInputs.quests
            : Array.isArray(aiAdditions.questsTemplate)
              ? aiAdditions.questsTemplate
              : aiAdditions.quests;
    if (!Array.isArray(template) || template.length === 0) return;

    const [canonicalNpcs, locations, factions] = await Promise.all([
      this.npcRepo.find({
        where: { campaignId: campaign.id, gameSessionId: IsNull() },
        select: ["id", "name"],
      }),
      this.locationRepo.find({
        where: { campaignId: campaign.id },
        select: ["id", "name"],
      }),
      this.factionRepo.find({
        where: { campaignId: campaign.id },
        select: ["id", "name", "slug"],
      }),
    ]);
    const npcByName = this.mapByLowerName(canonicalNpcs);
    const locationByName = this.mapByLowerName(locations);
    const factionByName = new Map<string, FactionEntity>();
    for (const faction of factions) {
      factionByName.set(faction.name.toLowerCase(), faction);
      if (faction.slug) factionByName.set(faction.slug.toLowerCase(), faction);
    }

    let created = 0;
    for (const raw of template) {
      if (!raw || typeof raw !== "object") continue;
      const q = raw as Record<string, unknown>;
      const name = typeof q.name === "string" ? q.name : null;
      if (!name) continue;

      const objectivesRaw = Array.isArray(q.objectives) ? q.objectives : [];
      const objectives: NonNullable<CreateQuestDto["objectives"]> = [];
      for (const o of objectivesRaw) {
        if (!o || typeof o !== "object") continue;
        const obj = o as Record<string, unknown>;
        const desc =
          typeof obj.description === "string" ? obj.description : null;
        if (!desc) continue;
        objectives.push({
          description: desc,
          kind: typeof obj.kind === "string" ? (obj.kind as any) : undefined,
          targetName:
            typeof obj.targetName === "string" ? obj.targetName : undefined,
          targetNpcId:
            typeof obj.targetName === "string"
              ? npcByName.get(obj.targetName.toLowerCase())?.id
              : undefined,
          targetLocationId:
            typeof obj.targetName === "string"
              ? locationByName.get(obj.targetName.toLowerCase())?.id
              : undefined,
          targetFactionId:
            typeof obj.targetName === "string"
              ? factionByName.get(obj.targetName.toLowerCase())?.id
              : undefined,
          targetCity:
            typeof obj.targetCity === "string" ? obj.targetCity : null,
          amount: typeof obj.amount === "number" ? obj.amount : null,
        });
      }

      const rewardsRaw = q.rewards;
      const rewards =
        rewardsRaw &&
        typeof rewardsRaw === "object" &&
        !Array.isArray(rewardsRaw)
          ? (rewardsRaw as CreateQuestDto["rewards"])
          : undefined;

      const dto: CreateQuestDto = {
        name,
        description:
          typeof q.description === "string" ? q.description : undefined,
        isMainQuest: q.isMainQuest === true,
        giverNpcId: this.resolveQuestGiverId(q, npcByName),
        objectives,
        rewards,
      };

      try {
        const quest = await this.questService.create(sessionId, dto);
        if (dto.isMainQuest) {
          await this.questService.revealQuest(
            sessionId,
            quest.slug,
            "Main quest revelada no início da aventura.",
          );
        }
        created += 1;
      } catch (err) {
        this.logger.warn("session.materialize_quest.failed", {
          "session.id": sessionId,
          "campaign.id": campaign.id,
          "quest.name": name,
          "error.message": err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (created > 0) {
      this.logger.info("session.materialize_quests.done", {
        "session.id": sessionId,
        "campaign.id": campaign.id,
        "quests.created": created,
      });
    }
  }

  private resolveQuestGiverId(
    q: Record<string, unknown>,
    npcByName: Map<string, Pick<NpcEntity, "id" | "name">>,
  ): string | undefined {
    const candidates = [
      q.giverNpcName,
      q.triggerNpcName,
      Array.isArray(q.objectives)
        ? (q.objectives as Array<Record<string, unknown>>).find(
            (o) => o?.kind === "talk_to_npc" && typeof o.targetName === "string",
          )?.targetName
        : undefined,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const npc = npcByName.get(candidate.toLowerCase());
      if (npc) return npc.id;
    }
    return undefined;
  }

  private mapByLowerName<T extends { name: string }>(items: T[]): Map<string, T> {
    return new Map(items.map((item) => [item.name.toLowerCase(), item]));
  }

  private async inferStartingLocation(
    campaignId: string,
  ): Promise<string | null> {
    const locations = await this.locationRepo.find({
      where: { campaignId },
      select: ["id", "type", "sortOrder", "createdAt"],
    });
    if (locations.length === 0) return null;

    const ranked = [...locations].sort((a, b) => {
      const pa = STARTING_LOCATION_TYPE_PRIORITY[a.type] ?? 99;
      const pb = STARTING_LOCATION_TYPE_PRIORITY[b.type] ?? 99;
      if (pa !== pb) return pa - pb;
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return ranked[0].id;
  }

  async getById(sessionId: string): Promise<GameSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException("Sessao nao encontrada.");

    if (session.activeEncounterId) {
      const enc = await this.encounterRepo.findOne({
        where: { id: session.activeEncounterId },
        select: ["id", "status"],
      });
      if (!enc || enc.status === "completed") {
        await this.setActiveEncounter(sessionId, null);
        session.activeEncounterId = null;
      }
    }
    return session;
  }

  async listByUser(userId: string): Promise<GameSessionEntity[]> {
    return this.sessionRepo.find({
      where: { ownerId: userId },
      order: { createdAt: "DESC" },
    });
  }

  async update(
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<GameSessionEntity> {
    const session = await this.getById(sessionId);
    if (dto.name !== undefined) session.name = dto.name;
    if (dto.status !== undefined) session.status = dto.status;
    if (dto.activeEncounterId !== undefined)
      session.activeEncounterId = dto.activeEncounterId ?? undefined;
    if (dto.scene !== undefined) session.scene = dto.scene;
    const saved = await this.sessionRepo.save(session);
    this.invalidateAccessCache(sessionId);
    return saved;
  }

  async addCharacter(
    sessionId: string,
    characterId: string,
  ): Promise<GameSessionEntity> {
    const session = await this.getById(sessionId);
    if (!session.characterIds.includes(characterId)) {
      session.characterIds = [...session.characterIds, characterId];
    }
    const saved = await this.sessionRepo.save(session);
    this.invalidateAccessCache(sessionId);





    if (saved.campaignId) {
      try {
        const character = await this.characterRepo.findOne({
          where: { id: characterId },
          select: ["id", "userId"],
        });
        if (character?.userId) {
          const existing = await this.campaignPlayerRepo.findOne({
            where: { campaignId: saved.campaignId, userId: character.userId },
          });
          if (existing) {
            existing.characterId = characterId;
            existing.isActive = true;
            await this.campaignPlayerRepo.save(existing);
          } else {
            await this.campaignPlayerRepo.save(
              this.campaignPlayerRepo.create({
                campaignId: saved.campaignId,
                userId: character.userId,
                characterId,
                isActive: true,
              }),
            );
          }
        }
      } catch (err) {
        this.logger.warn("session.add_character.campaign_players_link_failed", {
          "session.id": sessionId,
          "character.id": characterId,
          "error.message": err instanceof Error ? err.message : String(err),
        });
      }
    }
    return saved;
  }

  async delete(sessionId: string): Promise<void> {



    this.invalidateAccessCache(sessionId);
    await this.sessionRepo.delete(sessionId);
  }

  async removeCharacter(
    sessionId: string,
    characterId: string,
  ): Promise<GameSessionEntity> {
    const session = await this.getById(sessionId);
    session.characterIds = session.characterIds.filter(
      (id) => id !== characterId,
    );
    const saved = await this.sessionRepo.save(session);
    this.invalidateAccessCache(sessionId);
    return saved;
  }

  async setActiveEncounter(
    sessionId: string,
    encounterId: string | null,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      activeEncounterId: encounterId,
    });
    this.invalidateAccessCache(sessionId);
  }

  async ensureOwnership(
    sessionId: string,
    userId: string,
  ): Promise<GameSessionEntity> {
    const session = await this.getById(sessionId);
    if (session.ownerId !== userId) {
      throw new NotFoundException("Sessao nao encontrada.");
    }
    return session;
  }

  async ensureAccess(
    sessionId: string,
    userId: string,
  ): Promise<GameSessionEntity> {
    const cached = this.getCachedAccess(sessionId, userId);
    if (cached) return cached;

    const session = await this.getById(sessionId);
    if (session.ownerId === userId) {
      this.setCachedAccess(sessionId, userId, session);
      return session;
    }
    if (session.campaignId) {
      const player = await this.campaignPlayerRepo.findOne({
        where: { campaignId: session.campaignId, userId, isActive: true },
      });
      if (player) {
        this.setCachedAccess(sessionId, userId, session);
        return session;
      }
    }
    throw new NotFoundException("Sessao nao encontrada.");
  }

  private getCachedAccess(
    sessionId: string,
    userId: string,
  ): GameSessionEntity | null {
    const key = this.accessCacheKey(sessionId, userId);
    const cached = this.accessCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.accessCache.delete(key);
      return null;
    }
    return cached.session;
  }

  private setCachedAccess(
    sessionId: string,
    userId: string,
    session: GameSessionEntity,
  ): void {
    this.accessCache.set(this.accessCacheKey(sessionId, userId), {
      session,
      expiresAt: Date.now() + SESSION_ACCESS_CACHE_TTL_MS,
    });
  }

  private invalidateAccessCache(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of this.accessCache.keys()) {
      if (key.startsWith(prefix)) this.accessCache.delete(key);
    }
  }

  private accessCacheKey(sessionId: string, userId: string): string {
    return `${sessionId}:${userId}`;
  }
}
