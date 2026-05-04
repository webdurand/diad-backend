import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameClockEntity } from "src/entities/game-clock.entity";
import { computeTimeOfDay, TimeOfDay } from "src/lib/time-of-day";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export interface AdvanceTimeOptions {
  hours: number;
  /** Origem do delta — usado em narrativeDescriptor + audit. */
  trigger?:
    | "scene_transition"
    | "long_rest"
    | "short_rest"
    | "combat_ended"
    | "manual_tool";
  /** Trace propagado para o envelope (Princípio XI). */
  traceId?: string;
}

export interface AdvanceTimeResult {
  clock: GameClockEntity;
  timeOfDay: TimeOfDay;
  previousTimeOfDay: TimeOfDay;
}

const MAX_HOURS_PER_CALL = 168; // 1 semana — sane upper bound

/**
 * Spec 019 — GameClockService.
 *
 * Gerencia o relógio in-game (1:1 com campaign). `advanceTime` aplica delta
 * em horas (>0, ≤168), recalcula `daysPassed`, computa novo `timeOfDay`,
 * persiste e emite `WorldEvent.time_advanced` via EventBusService.
 */
@Injectable()
export class GameClockService {
  constructor(
    @InjectRepository(GameClockEntity)
    private readonly clockRepo: Repository<GameClockEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  /**
   * Retorna clock existente OR cria com defaults (currentInGameDateTime=now,
   * 06:00/18:00). Idempotente — segura de chamar em qualquer fluxo.
   */
  async getOrCreate(campaignId: string): Promise<GameClockEntity> {
    const existing = await this.clockRepo.findOne({ where: { campaignId } });
    if (existing) return existing;
    const created = this.clockRepo.create({
      campaignId,
      currentInGameDateTime: new Date(),
      sunriseTime: "06:00",
      sunsetTime: "18:00",
      daysPassed: 0,
    });
    return this.clockRepo.save(created);
  }

  async getTimeOfDay(campaignId: string): Promise<TimeOfDay> {
    const clock = await this.getOrCreate(campaignId);
    return computeTimeOfDay(
      clock.currentInGameDateTime,
      clock.sunriseTime,
      clock.sunsetTime,
    );
  }

  async advanceTime(
    campaignId: string,
    options: AdvanceTimeOptions,
  ): Promise<AdvanceTimeResult> {
    const { hours, trigger = "manual_tool", traceId } = options;

    if (!Number.isFinite(hours) || hours <= 0) {
      throw new DomainException(
        ErrorCode.CLOCK_NEGATIVE_HOURS,
        "hours deve ser número positivo (>0).",
        { context: { hours }, hint: "Use horas inteiras ou frações positivas." },
      );
    }
    if (hours > MAX_HOURS_PER_CALL) {
      throw new DomainException(
        ErrorCode.CLOCK_NEGATIVE_HOURS,
        `hours acima do limite ${MAX_HOURS_PER_CALL} (1 semana). Quebre em chamadas menores.`,
        { context: { hours }, hint: "Máximo 168h por chamada." },
      );
    }

    const clock = await this.getOrCreate(campaignId);
    const previousTimeOfDay = computeTimeOfDay(
      clock.currentInGameDateTime,
      clock.sunriseTime,
      clock.sunsetTime,
    );

    const before = clock.currentInGameDateTime.getTime();
    const after = new Date(before + hours * 3600 * 1000);
    const dayBefore = new Date(before);
    dayBefore.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(after);
    dayAfter.setUTCHours(0, 0, 0, 0);
    const daysDelta = Math.round(
      (dayAfter.getTime() - dayBefore.getTime()) / 86_400_000,
    );

    clock.currentInGameDateTime = after;
    clock.daysPassed = clock.daysPassed + daysDelta;
    const saved = await this.clockRepo.save(clock);

    const newTimeOfDay = computeTimeOfDay(
      saved.currentInGameDateTime,
      saved.sunriseTime,
      saved.sunsetTime,
    );

    const envelope = this.factory.build({
      eventCategory: "WorldEvent",
      eventType: "time_advanced",
      source: {
        service: "diad-backend",
        module: "GameClockService.advanceTime",
        traceId,
      },
      scope: { campaignId },
      payload: {
        campaignId,
        deltaHours: hours,
        currentInGameDateTime: saved.currentInGameDateTime.toISOString(),
        timeOfDay: newTimeOfDay,
        previousTimeOfDay,
        daysPassed: saved.daysPassed,
        trigger,
      },
      narrativeDescriptor:
        previousTimeOfDay !== newTimeOfDay
          ? `Tempo avança: ${previousTimeOfDay} → ${newTimeOfDay}.`
          : `Tempo avança ${hours.toFixed(1)}h.`,
    });
    // Best-effort emit — falha não rollback de update.
    try {
      await this.eventBus.publish(envelope);
    } catch {
      /* swallow */
    }

    return {
      clock: saved,
      timeOfDay: newTimeOfDay,
      previousTimeOfDay,
    };
  }
}
