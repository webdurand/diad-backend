import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameEventEntity } from "src/entities/game-event.entity";
import { GameEventData } from "../interfaces/result.type";

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(GameEventEntity)
    private readonly eventRepo: Repository<GameEventEntity>,
  ) {}

  async emit(
    sessionId: string,
    encounterId: string | null,
    events: GameEventData[],
  ): Promise<GameEventEntity[]> {
    if (events.length === 0) return [];

    const startSeq = await this.getNextSequence(sessionId);
    const entities = events.map((e, i) =>
      this.eventRepo.create({
        sessionId,
        encounterId: encounterId ?? undefined,
        sequence: startSeq + i,
        eventType: e.event_type,
        actorParticipantId: e.actor_participant_id,
        targetParticipantId: e.target_participant_id,
        data: e.data,
      }),
    );

    return this.eventRepo.save(entities);
  }

  async getSessionTimeline(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): Promise<GameEventEntity[]> {
    return this.eventRepo.find({
      where: { sessionId },
      order: { sequence: "ASC" },
      skip: offset,
      take: limit,
    });
  }

  async getEncounterTimeline(encounterId: string): Promise<GameEventEntity[]> {
    return this.eventRepo.find({
      where: { encounterId },
      order: { sequence: "ASC" },
    });
  }

  /**
   * Spec 006 — timeline com filtros, paginação e count.
   */
  async getEncounterTimelineFiltered(
    encounterId: string,
    options: {
      since?: string;
      eventTypes?: string[];
      limit?: number;
      offset?: number;
    },
  ): Promise<{ events: GameEventEntity[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const qb = this.eventRepo
      .createQueryBuilder("e")
      .where("e.encounter_id = :encounterId", { encounterId })
      .orderBy("e.sequence", "ASC");

    if (options.since) {
      qb.andWhere("e.created_at > :since", { since: new Date(options.since) });
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      qb.andWhere("e.event_type IN (:...types)", { types: options.eventTypes });
    }

    const total = await qb.getCount();
    const events = await qb.skip(offset).take(limit).getMany();

    return { events, total };
  }

  private async getNextSequence(sessionId: string): Promise<number> {
    const result = await this.eventRepo
      .createQueryBuilder("e")
      .select("COALESCE(MAX(e.sequence), 0)", "max")
      .where("e.session_id = :sessionId", { sessionId })
      .getRawOne();
    return (parseInt(result.max, 10) || 0) + 1;
  }
}
