import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  EventListenerProcessedEntity,
  GameSessionEntity,
  LocationPoiEntity,
  SessionNpcStateEntity,
} from "src/entities";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventListener } from "src/common/event-bus/event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "src/common/event-bus/event-envelope.types";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import {
  isRoutineSlot,
  mapTimeOfDayToRoutineSlot,
  RoutineSlot,
} from "src/lib/routine-slot";
import type { TimeOfDay } from "src/lib/time-of-day";

@Injectable()
export class NpcRoutineListener implements EventListener {
  readonly name = "NpcRoutineListener";
  readonly categories: readonly EventCategory[] = ["WorldEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly stateRepo: Repository<SessionNpcStateEntity>,
    @InjectRepository(LocationPoiEntity)
    private readonly poiRepo: Repository<LocationPoiEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(NpcRoutineListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "period_changed") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const slot = this.resolveRoutineSlot(envelope);
    if (!slot) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const sessions = await this.resolveSessions(envelope);
    for (const session of sessions) {
      await this.migrateSessionNpcs(session, slot, envelope);
    }

    await this.markProcessed(envelope.eventId);
  }

  private resolveRoutineSlot(envelope: EventEnvelope): RoutineSlot | null {
    const payload = envelope.payload ?? {};
    const rawSlot = payload.routineSlot;
    if (isRoutineSlot(rawSlot)) return rawSlot;

    const timeOfDay = (payload.timeOfDay ?? payload.newPeriod) as
      | TimeOfDay
      | undefined;
    if (!timeOfDay) {
      this.logger.warn("npc_routine.invalid_slot_payload", {
        "error.code": ErrorCode.NPC_ROUTINE_INVALID_SLOT,
        "event.id": envelope.eventId,
      });
      return null;
    }

    return mapTimeOfDayToRoutineSlot(timeOfDay);
  }

  private async resolveSessions(
    envelope: EventEnvelope,
  ): Promise<GameSessionEntity[]> {
    if (envelope.scope.sessionId) {
      const session = await this.sessionRepo.findOne({
        where: { id: envelope.scope.sessionId },
      });
      return session ? [session] : [];
    }
    return this.sessionRepo.find({
      where: {
        campaignId: envelope.scope.campaignId,
        status: "active",
      },
    });
  }

  private async migrateSessionNpcs(
    session: GameSessionEntity,
    slot: RoutineSlot,
    envelope: EventEnvelope,
  ): Promise<void> {
    const states = await this.stateRepo.find({
      where: { gameSessionId: session.id, status: "alive" },
      relations: ["npc"],
    });

    for (const state of states) {
      const npc = state.npc;
      if (!npc || npc.profileDepth !== "core") continue;
      const targetPoiId = npc.routineSlots?.[slot];
      if (!targetPoiId || targetPoiId === state.currentPoiId) continue;

      const targetPoi = await this.poiRepo.findOne({
        where: { id: targetPoiId },
        select: ["id", "locationId", "name"],
      });
      if (!targetPoi) {
        this.logger.warn("npc_routine.target_poi_missing", {
          "error.code": ErrorCode.NPC_ROUTINE_INVALID_SLOT,
          "session.id": session.id,
          "npc.id": npc.id,
          "poi.id": targetPoiId,
          "routine.slot": slot,
        });
        continue;
      }

      const fromPoiId = state.currentPoiId ?? null;
      const fromLocationId = state.currentLocationId ?? null;
      state.currentPoiId = targetPoi.id;
      state.currentLocationId = targetPoi.locationId;
      await this.stateRepo.save(state);

      await this.publishNpcMoved({
        envelope,
        session,
        npcId: npc.id,
        npcName: npc.name,
        routineSlot: slot,
        fromPoiId,
        fromLocationId,
        toPoiId: targetPoi.id,
        toLocationId: targetPoi.locationId,
      });
    }
  }

  private async publishNpcMoved(input: {
    envelope: EventEnvelope;
    session: GameSessionEntity;
    npcId: string;
    npcName: string;
    routineSlot: RoutineSlot;
    fromPoiId: string | null;
    fromLocationId: string | null;
    toPoiId: string;
    toLocationId: string;
  }): Promise<void> {
    const moved = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType: "npc_moved",
      source: {
        service: "diad-backend",
        module: "NpcRoutineListener",
        traceId: input.envelope.source.traceId,
      },
      scope: {
        campaignId: input.envelope.scope.campaignId,
        sessionId: input.session.id,
      },
      aggregateId: input.npcId,
      payload: {
        npcId: input.npcId,
        routineSlot: input.routineSlot,
        fromPoiId: input.fromPoiId,
        toPoiId: input.toPoiId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        reason: "routine_slot_changed",
        sourceEventId: input.envelope.eventId,
      },
      narrativeDescriptor: `${input.npcName} mudou de rotina (${input.routineSlot}).`,
    });
    await this.eventBus.publish(moved);
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
      this.logger.warn("npc_routine.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
