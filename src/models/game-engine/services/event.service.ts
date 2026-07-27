import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { GameEventEntity } from "src/entities/game-event.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameEventData } from "../interfaces/result.type";

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(GameEventEntity)
    private readonly eventRepo: Repository<GameEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async emit(
    sessionId: string,
    encounterId: string | null,
    events: GameEventData[],
    manager?: EntityManager,
  ): Promise<GameEventEntity[]> {
    if (events.length === 0) return [];

    if (manager) {
      return this.persist(manager, sessionId, encounterId, events);
    }
    return this.dataSource.transaction((transactionManager) =>
      this.persist(
        transactionManager,
        sessionId,
        encounterId,
        events,
      ),
    );
  }

  private async persist(
    manager: EntityManager,
    sessionId: string,
    encounterId: string | null,
    events: GameEventData[],
  ): Promise<GameEventEntity[]> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `game_event:${sessionId}`,
    ]);

    const startSeq = await this.computeNextSequence(manager, sessionId);
    const participantIds = [
      ...new Set(
        events.flatMap((event) =>
          [event.actor_participant_id, event.target_participant_id].filter(
            (id): id is string => typeof id === "string",
          ),
        ),
      ),
    ];
    const participantNames =
      participantIds.length > 0
        ? new Map(
            (
              await manager
                .createQueryBuilder(EncounterParticipantEntity, "participant")
                .select(["participant.id", "participant.displayName"])
                .where("participant.id IN (:...participantIds)", {
                  participantIds,
                })
                .getMany()
            ).map((participant) => [
              participant.id,
              participant.displayName,
            ]),
          )
        : new Map<string, string>();
    const entities = events.map((e, i) =>
      manager.create(GameEventEntity, {
        sessionId,
        encounterId: encounterId ?? undefined,
        sequence: startSeq + i,
        eventType: e.event_type,
        actorParticipantId: e.actor_participant_id,
        targetParticipantId: e.target_participant_id,
        data: {
          ...e.data,
          ...(e.actor_participant_id &&
          participantNames.has(e.actor_participant_id) &&
          typeof e.data?.actorName !== "string"
            ? {
                actorName: participantNames.get(e.actor_participant_id),
              }
            : {}),
          ...(e.target_participant_id &&
          participantNames.has(e.target_participant_id) &&
          typeof e.data?.targetName !== "string"
            ? {
                targetName: participantNames.get(e.target_participant_id),
              }
            : {}),
        },
      }),
    );

    return manager.save(GameEventEntity, entities);
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


  async getEncounterTimelineFiltered(
    encounterId: string,
    options: {
      since?: string;
      eventTypes?: string[];
      limit?: number;
      offset?: number;
      latest?: boolean;
    },
  ): Promise<{ events: GameEventEntity[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const qb = this.eventRepo
      .createQueryBuilder("e")
      .where("e.encounter_id = :encounterId", { encounterId })
      .orderBy("e.sequence", options.latest ? "DESC" : "ASC");

    if (options.since) {
      qb.andWhere("e.created_at > :since", { since: new Date(options.since) });
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      qb.andWhere("e.event_type IN (:...types)", { types: options.eventTypes });
    }

    const total = await qb.getCount();
    const events = await qb.skip(offset).take(limit).getMany();
    if (options.latest) events.reverse();

    return { events, total };
  }

  private async computeNextSequence(
    manager: EntityManager,
    sessionId: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(GameEventEntity, "e")
      .select("COALESCE(MAX(e.sequence), 0)", "max")
      .where("e.session_id = :sessionId", { sessionId })
      .getRawOne<{ max: string | number }>();
    const raw = result?.max ?? 0;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    return (Number.isFinite(parsed) ? parsed : 0) + 1;
  }
}
