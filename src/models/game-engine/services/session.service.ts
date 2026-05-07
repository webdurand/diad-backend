import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { LocationEntity } from "src/entities/location.entity";
import { SceneService } from "src/models/session/services/scene.service";
import { QuestService } from "src/models/world/services/quest.service";
import type { CreateQuestDto } from "src/models/world/services/quest.service";
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

export interface CreateSessionDto {
  name: string;
  campaignId?: string;
  config?: {
    dice_seed?: number;
    critical_variant?: "double_dice" | "double_damage";
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
    private readonly sceneService: SceneService,
    private readonly questService: QuestService,
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
      config: dto.config ?? {},
    });
    const saved = await this.sessionRepo.save(session);

    if (campaign) {
      await this.bootstrapInitialScene(saved.id, campaign);
      await this.materializeQuestsFromTemplate(saved.id, campaign);
    }

    return saved;
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

      await this.sceneService.create(sessionId, {
        title: campaign.name,
        reason: "session_bootstrap",
        skipBudgetIncrement: true,
      });
    } catch (err) {
      this.logger.warn("session.bootstrap_initial_scene.failed", {
        "session.id": sessionId,
        "campaign.id": campaign.id,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async materializeQuestsFromTemplate(
    sessionId: string,
    campaign: CampaignEntity,
  ): Promise<void> {
    const seed = (campaign.generationSeed ?? {}) as Record<string, unknown>;
    const template = seed.questsTemplate;
    if (!Array.isArray(template) || template.length === 0) return;

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
        const desc = typeof obj.description === "string" ? obj.description : null;
        if (!desc) continue;
        objectives.push({
          description: desc,
          kind: typeof obj.kind === "string" ? (obj.kind as any) : undefined,
          targetName:
            typeof obj.targetName === "string" ? obj.targetName : undefined,
          targetCity:
            typeof obj.targetCity === "string" ? obj.targetCity : null,
          amount:
            typeof obj.amount === "number" ? obj.amount : null,
        });
      }

      const rewardsRaw = q.rewards;
      const rewards =
        rewardsRaw && typeof rewardsRaw === "object" && !Array.isArray(rewardsRaw)
          ? (rewardsRaw as CreateQuestDto["rewards"])
          : undefined;

      const dto: CreateQuestDto = {
        name,
        description: typeof q.description === "string" ? q.description : undefined,
        isMainQuest: q.isMainQuest === true,
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
    return this.sessionRepo.save(session);
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

    // Spec 027 (M2 follow-up) — espelhar (campaignId, userId, characterId)
    // em campaign_players. Sem isso, em DIAD solo o frontend não conseguia
    // resolver `currentOwnerUserId` via campaignPlayers.find(...) e o player
    // perdia ActionBar do próprio PC. Idempotente: upsert por (campaignId, userId).
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
    // Mundo (campaign) é setting reusável: 1 mundo → N aventuras. Apagar
    // aventura NÃO apaga o mundo — cleanup de campaign é explícito via
    // DELETE /campaigns/:id.
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
    return this.sessionRepo.save(session);
  }

  async setActiveEncounter(
    sessionId: string,
    encounterId: string | null,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      activeEncounterId: encounterId,
    });
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
    const session = await this.getById(sessionId);
    if (session.ownerId === userId) return session;
    if (session.campaignId) {
      const player = await this.campaignPlayerRepo.findOne({
        where: { campaignId: session.campaignId, userId, isActive: true },
      });
      if (player) return session;
    }
    throw new NotFoundException("Sessao nao encontrada.");
  }
}
