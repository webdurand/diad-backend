import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { SessionEventEntity } from "src/entities/session-event.entity";

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
    private readonly dataSource: DataSource,
  ) {}

  async logEvent(dto: LogEventDto): Promise<SessionEventEntity> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `session_event:${dto.sessionId}`,
      ]);

      const sequence = await this.computeNextSequence(manager, dto.sessionId);
      const event = manager.create(SessionEventEntity, {
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
      return manager.save(SessionEventEntity, event);
    });
  }

  async getSessionEvents(
    sessionId: string,
    limit = 100,
    offset = 0,
  ): Promise<SessionEventEntity[]> {
    return this.eventRepo.find({
      where: { sessionId },
      order: { sequence: "ASC" },
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
      order: { sequence: "DESC" },
      take: limit,
    });
  }

  async getSceneEvents(sceneId: string): Promise<SessionEventEntity[]> {
    return this.eventRepo.find({
      where: { sceneId },
      order: { sequence: "ASC" },
    });
  }

  private async computeNextSequence(
    manager: EntityManager,
    sessionId: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(SessionEventEntity, "e")
      .select("COALESCE(MAX(e.sequence), 0)", "max")
      .where("e.session_id = :sessionId", { sessionId })
      .getRawOne<{ max: string | number }>();
    const raw = result?.max ?? 0;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    return (Number.isFinite(parsed) ? parsed : 0) + 1;
  }
}
