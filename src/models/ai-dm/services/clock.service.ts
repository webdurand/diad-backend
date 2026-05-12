import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ClockAdvanceRules,
  ClockEntity,
  ClockOnFullAction,
  ClockStatus,
  ClockType,
} from "src/entities/clock.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventLogService } from "src/models/session/services/event-log.service";

export interface CreateClockDto {
  name: string;
  segments: number;
  type?: ClockType;
  visibleToPlayer?: boolean;
  onFullAction?: ClockOnFullAction;
  advanceRules?: ClockAdvanceRules;
  expiresAt?: string;
}

export interface AdvanceClockDto {
  amount?: number;
  reason?: string;
  sessionId?: string;
  sceneId?: string;
  traceId?: string;
}

export interface ResolveClockDto {
  reason?: string;
  sessionId?: string;
  sceneId?: string;
  traceId?: string;
}

@Injectable()
export class ClockService {
  constructor(
    @InjectRepository(ClockEntity)
    private readonly clockRepo: Repository<ClockEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventLog: EventLogService,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  async create(campaignId: string, dto: CreateClockDto): Promise<ClockEntity> {
    if (dto.segments < 1) {
      throw new BadRequestException({
        ok: false,
        error: "Relógio precisa de pelo menos 1 segmento.",
        code: "CLOCK_SEGMENTS_INVALID",
      });
    }
    const clock = this.clockRepo.create({
      campaignId,
      name: dto.name,
      segments: dto.segments,
      filled: 0,
      status: "active",
      type: dto.type ?? "threat",
      visibleToPlayer: dto.visibleToPlayer ?? true,
      onFullAction: dto.onFullAction ?? ({} as ClockOnFullAction),
      advanceRules: dto.advanceRules ?? ({} as ClockAdvanceRules),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    return this.clockRepo.save(clock);
  }

  async listByCampaign(campaignId: string): Promise<ClockEntity[]> {
    return this.clockRepo.find({
      where: { campaignId },
      order: { createdAt: "ASC" },
    });
  }

  async getById(clockId: string): Promise<ClockEntity> {
    const clock = await this.clockRepo.findOne({ where: { id: clockId } });
    if (!clock) {
      throw new NotFoundException({
        ok: false,
        error: "Relógio não encontrado.",
        code: "CLOCK_NOT_FOUND",
      });
    }
    return clock;
  }

  async advance(
    clockId: string,
    dto: AdvanceClockDto,
  ): Promise<{
    clock: ClockEntity;
    triggered: boolean;
    previousFilled: number;
    delta: number;
  }> {
    const amount = Math.trunc(dto.amount ?? 1);
    const before = await this.getById(clockId);
    const wasFull = before.status === "filled" || before.filled >= before.segments;

    if (!Number.isFinite(amount) || amount === 0) {
      return {
        clock: before,
        triggered: false,
        previousFilled: before.filled,
        delta: 0,
      };
    }

    const raw = await this.clockRepo.query(
      `WITH target AS (
         SELECT id, status, filled, segments
         FROM clocks
         WHERE id = $1
       ), updated AS (
         SELECT
           id,
           CASE
             WHEN status IN ('resolved', 'expired') THEN filled
             ELSE LEAST(segments, GREATEST(0, filled + $2))
           END AS next_filled
         FROM target
       )
       UPDATE clocks c
          SET filled = updated.next_filled,
              status = CASE
                WHEN c.status IN ('resolved', 'expired') THEN c.status
                WHEN updated.next_filled >= c.segments THEN 'filled'
                ELSE 'active'
              END,
              updated_at = now()
         FROM updated
        WHERE c.id = updated.id
      RETURNING c.*`,
      [clockId, amount],
    );
    const rows = this.normalizeRows(raw);
    if (rows.length === 0) {
      throw new NotFoundException({
        ok: false,
        error: "Relógio não encontrado.",
        code: "CLOCK_NOT_FOUND",
      });
    }
    const row = rows[0];
    const clock: ClockEntity = {
      id: row.id,
      campaignId: row.campaign_id,
      campaign: undefined as unknown as never,
      name: row.name,
      segments: row.segments,
      filled: row.filled,
      status: (row.status ?? "active") as ClockStatus,
      type: row.type,
      visibleToPlayer: row.visible_to_player,
      onFullAction: row.on_full_action,
      advanceRules: row.advance_rules,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? undefined,
    };

    const isNowFull = clock.filled >= clock.segments;
    const triggered = isNowFull && !wasFull;
    const delta = clock.filled - before.filled;
    if (delta !== 0) {
      await this.publishClockEvent(
        "clock_progressed",
        clock,
        dto,
        before.filled,
        delta,
        triggered,
      );
    }
    if (triggered) {
      await this.emitOnFullEvent(clock, dto);
      await this.publishClockEvent(
        "clock_filled",
        clock,
        dto,
        before.filled,
        delta,
        true,
      );
    }
    return { clock, triggered, previousFilled: before.filled, delta };
  }

  async resolve(
    clockId: string,
    dto: ResolveClockDto,
  ): Promise<{ clock: ClockEntity; resolved: boolean }> {
    const before = await this.getById(clockId);
    if (before.status === "resolved") {
      return { clock: before, resolved: false };
    }

    const raw = await this.clockRepo.query(
      `UPDATE clocks
          SET status = 'resolved',
              updated_at = now()
        WHERE id = $1
      RETURNING *`,
      [clockId],
    );
    const rows = this.normalizeRows(raw);
    if (rows.length === 0) {
      throw new NotFoundException({
        ok: false,
        error: "Relógio não encontrado.",
        code: "CLOCK_NOT_FOUND",
      });
    }
    const clock = this.rowToClock(rows[0]);
    await this.publishClockEvent(
      "clock_resolved",
      clock,
      dto,
      before.filled,
      0,
      false,
    );
    return { clock, resolved: true };
  }

  private normalizeRows(raw: unknown): Array<Record<string, any>> {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];
      const first = raw[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        return raw as Array<Record<string, any>>;
      }
      if (Array.isArray(first)) return first as Array<Record<string, any>>;
      return [];
    }
    if (typeof raw === "object" && raw !== null && "rows" in (raw as any)) {
      return ((raw as any).rows ?? []) as Array<Record<string, any>>;
    }
    return [];
  }

  private rowToClock(row: Record<string, any>): ClockEntity {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      campaign: undefined as unknown as never,
      name: row.name,
      segments: row.segments,
      filled: row.filled,
      status: (row.status ?? "active") as ClockStatus,
      type: row.type,
      visibleToPlayer: row.visible_to_player,
      onFullAction: row.on_full_action,
      advanceRules: row.advance_rules,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? undefined,
    };
  }

  private async publishClockEvent(
    eventType: "clock_progressed" | "clock_filled" | "clock_resolved",
    clock: ClockEntity,
    dto: AdvanceClockDto | ResolveClockDto,
    previousFilled: number,
    delta: number,
    triggered: boolean,
  ): Promise<void> {
    try {
      const sessionId = await this.resolveSessionId(clock, dto.sessionId);
      const isFull = clock.filled >= clock.segments;
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType,
        source: {
          service: "diad-backend",
          module: `ClockService.${eventType}`,
          traceId: dto.traceId,
        },
        scope: {
          campaignId: clock.campaignId,
          ...(sessionId ? { sessionId } : {}),
          ...(dto.sceneId ? { sceneId: dto.sceneId } : {}),
        },
        audiences: ["Narrator", "Director", "HUD"],
        payload: {
          campaignId: clock.campaignId,
          ...(sessionId ? { sessionId } : {}),
          ...(dto.sceneId ? { sceneId: dto.sceneId } : {}),
          clockId: clock.id,
          name: clock.name,
          type: clock.type,
          previousFilled,
          filled: clock.filled,
          segments: clock.segments,
          delta,
          reason: dto.reason ?? null,
          evidence: dto.reason ?? null,
          isFull,
          triggered,
          status: clock.status,
          clock: {
            id: clock.id,
            name: clock.name,
            type: clock.type,
            filled: clock.filled,
            segments: clock.segments,
            status: clock.status,
            visibleToPlayer: clock.visibleToPlayer,
          },
        },
        narrativeDescriptor:
          eventType === "clock_filled"
            ? `Ponto de ruptura: ${clock.name}`
            : eventType === "clock_resolved"
              ? `Tensão resolvida: ${clock.name}`
              : `Tensão avançou: ${clock.name}`,
        metadata: {
          tags: ["clock", clock.type],
          narrativeWeight: eventType === "clock_filled" ? 8 : 5,
        },
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort */
    }
  }

  private async resolveSessionId(
    clock: ClockEntity,
    provided?: string,
  ): Promise<string | undefined> {
    if (provided) return provided;
    const latest = await this.sessionRepo.findOne({
      where: { campaignId: clock.campaignId },
      order: { updatedAt: "DESC" },
    });
    return latest?.id;
  }

  private async emitOnFullEvent(
    clock: ClockEntity,
    advance: AdvanceClockDto,
  ): Promise<void> {
    const sessionId = await this.resolveSessionId(clock, advance.sessionId);
    if (!sessionId) return;

    await this.eventLog.logEvent({
      sessionId,
      sceneId: advance.sceneId,
      eventType: "clock_full",
      summary: `Relógio "${clock.name}" preencheu (${clock.segments}/${clock.segments}).`,
      details: {
        clockId: clock.id,
        clockName: clock.name,
        clockType: clock.type,
        trigger: clock.onFullAction?.trigger,
        narrativeSeed: clock.onFullAction?.narrativeSeed,
        associatedEntityId: clock.onFullAction?.associatedEntityId,
        reason: advance.reason,
      },
      isVisibleToPlayers: clock.visibleToPlayer,
    });
  }
}
