import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEventEntity } from 'src/entities/session-event.entity';

export interface LogEventDto {
  sessionId: string;
  sceneId?: string;
  eventType: string;
  summary: string;
  details?: Record<string, any>;
  actorCharacterId?: string;
  actorNpcId?: string;
  isVisibleToPlayers?: boolean;
}

@Injectable()
export class EventLogService {
  constructor(
    @InjectRepository(SessionEventEntity)
    private readonly eventRepo: Repository<SessionEventEntity>,
  ) {}

  async logEvent(dto: LogEventDto): Promise<SessionEventEntity> {
    const sequence = await this.getNextSequence(dto.sessionId);

    const event = this.eventRepo.create({
      sessionId: dto.sessionId,
      sceneId: dto.sceneId,
      eventType: dto.eventType,
      sequence,
      summary: dto.summary,
      details: dto.details ?? {},
      actorCharacterId: dto.actorCharacterId,
      actorNpcId: dto.actorNpcId,
      isVisibleToPlayers: dto.isVisibleToPlayers ?? true,
    });

    return this.eventRepo.save(event);
  }

  async getSessionEvents(
    sessionId: string,
    limit = 100,
    offset = 0,
  ): Promise<SessionEventEntity[]> {
    return this.eventRepo.find({
      where: { sessionId },
      order: { sequence: 'ASC' },
      skip: offset,
      take: limit,
    });
  }

  async getRecentEvents(
    sessionId: string,
    limit = 25,
  ): Promise<SessionEventEntity[]> {
    return this.eventRepo.find({
      where: { sessionId },
      order: { sequence: 'DESC' },
      take: limit,
    });
  }

  async getSceneEvents(sceneId: string): Promise<SessionEventEntity[]> {
    return this.eventRepo.find({
      where: { sceneId },
      order: { sequence: 'ASC' },
    });
  }

  private async getNextSequence(sessionId: string): Promise<number> {
    const result = await this.eventRepo
      .createQueryBuilder('e')
      .select('COALESCE(MAX(e.sequence), 0)', 'max')
      .where('e.session_id = :sessionId', { sessionId })
      .getRawOne();
    return (parseInt(result.max, 10) || 0) + 1;
  }
}
