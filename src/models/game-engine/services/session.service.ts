import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSessionEntity } from 'src/entities/game-session.entity';

export interface CreateSessionDto {
  name: string;
  config?: {
    dice_seed?: number;
    critical_variant?: 'double_dice' | 'double_damage';
  };
}

export interface UpdateSessionDto {
  name?: string;
  status?: 'lobby' | 'active' | 'paused' | 'completed';
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
  ) {}

  async create(
    ownerId: string,
    dto: CreateSessionDto,
  ): Promise<GameSessionEntity> {
    const session = this.sessionRepo.create({
      name: dto.name,
      ownerId,
      status: 'lobby',
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
    if (!session) throw new NotFoundException('Sessao nao encontrada.');
    return session;
  }

  async listByUser(userId: string): Promise<GameSessionEntity[]> {
    return this.sessionRepo.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<GameSessionEntity> {
    const session = await this.getById(sessionId);
    if (dto.name !== undefined) session.name = dto.name;
    if (dto.status !== undefined) session.status = dto.status;
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
    return this.sessionRepo.save(session);
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
      throw new NotFoundException('Sessao nao encontrada.');
    }
    return session;
  }
}
