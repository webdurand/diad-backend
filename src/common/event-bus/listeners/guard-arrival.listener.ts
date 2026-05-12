import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import {
  PendingGuardDispatchEntity,
  PendingGuardDispatchStatus,
} from "src/entities/pending-guard-dispatch.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventCategory, EventEnvelope } from "../event-envelope.types";

const TURNS_TO_SEQUENCE_MULTIPLIER = 2;
const DEFAULT_DELAY_TURNS = 1;

@Injectable()
export class GuardArrivalListener implements EventListener {
  readonly name = "GuardArrivalListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(PendingGuardDispatchEntity)
    private readonly pendingRepo: Repository<PendingGuardDispatchEntity>,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(GuardArrivalListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "guard_dispatched") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    const campaignId = envelope.scope.campaignId;
    if (!sessionId || !campaignId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const payload = envelope.payload ?? {};
    const guardNpcIds = Array.isArray(payload.guardWitnessIds)
      ? (payload.guardWitnessIds as string[]).filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    const locationId = payload.locationId as string | undefined;

    if (guardNpcIds.length === 0 || !locationId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const delayTurns =
      typeof payload.delayTurns === "number" && payload.delayTurns > 0
        ? Math.floor(payload.delayTurns)
        : DEFAULT_DELAY_TURNS;
    const severity =
      typeof payload.severity === "number" ? payload.severity : 2;
    const dispatchReason =
      typeof payload.dispatchReason === "string"
        ? payload.dispatchReason
        : null;

    const currentMaxSequence = await this.getCurrentMaxSequence(sessionId);
    const targetSequence =
      currentMaxSequence + delayTurns * TURNS_TO_SEQUENCE_MULTIPLIER;

    try {
      await this.pendingRepo.save(
        this.pendingRepo.create({
          campaignId,
          sessionId,
          locationId,
          guardNpcIds,
          targetSequence,
          status: "pending" as PendingGuardDispatchStatus,
          sourceEventId: envelope.eventId,
          severity,
          dispatchReason,
        }),
      );
    } catch (err) {
      this.logger.warn("guard_arrival.persist_failed", {
        "event.id": envelope.eventId,
        "session.id": sessionId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    await this.markProcessed(envelope.eventId);
  }

  private async getCurrentMaxSequence(sessionId: string): Promise<number> {
    const result = await this.pendingRepo.manager.query(
      `SELECT COALESCE(MAX(sequence_number), 0)::int AS max
       FROM session_messages
       WHERE session_id = $1`,
      [sessionId],
    );
    if (Array.isArray(result) && result.length > 0) {
      const max = Number(result[0]?.max ?? 0);
      return Number.isFinite(max) ? max : 0;
    }
    return 0;
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.processedRepo.findOne({
      where: { listenerName: this.name, eventId },
      select: ["id"],
    });
    return !!found;
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.processedRepo.save(
        this.processedRepo.create({ listenerName: this.name, eventId }),
      );
    } catch (err) {
      this.logger.warn("guard_arrival.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
