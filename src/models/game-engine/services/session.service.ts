import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { CharacterEntity } from "src/entities/character.entity";

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
  ) {}

  async create(
    ownerId: string,
    dto: CreateSessionDto,
  ): Promise<GameSessionEntity> {
    const session = this.sessionRepo.create({
      name: dto.name,
      ownerId,
      campaignId: dto.campaignId ?? undefined,
      status: "lobby",
      characterIds: [],
      scene: {},
      config: dto.config ?? {},
    });
    return this.sessionRepo.save(session);
  }

  async getById(sessionId: string): Promise<GameSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException("Sessao nao encontrada.");
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
        // Best-effort — falha aqui não derruba addCharacter (testes podem
        // rodar com character.userId nulo). Log não-disruptivo.
        // eslint-disable-next-line no-console
        console.warn(
          `session.addCharacter: campaign_players link falhou (session=${sessionId}, character=${characterId}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return saved;
  }

  async delete(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    const campaignId = session?.campaignId;

    await this.sessionRepo.delete(sessionId);

    // Delete associated campaign (cascade removes locations, NPCs, quests, etc.)
    if (campaignId) {
      await this.campaignRepo.delete(campaignId);
    }
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
      activeEncounterId: encounterId ?? undefined,
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
