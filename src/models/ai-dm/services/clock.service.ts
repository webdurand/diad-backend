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
  ClockType,
} from "src/entities/clock.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
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
}

@Injectable()
export class ClockService {
  constructor(
    @InjectRepository(ClockEntity)
    private readonly clockRepo: Repository<ClockEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventLog: EventLogService,
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
  ): Promise<{ clock: ClockEntity; triggered: boolean }> {
    const amount = dto.amount ?? 1;
    const before = await this.getById(clockId);
    const wasFull = before.filled >= before.segments;

    const raw = await this.clockRepo.query(
      `UPDATE clocks
         SET filled = LEAST(segments, GREATEST(0, filled + $2)),
             updated_at = now()
       WHERE id = $1
       RETURNING *`,
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
    if (triggered) {
      await this.emitOnFullEvent(clock, dto);
    }
    return { clock, triggered };
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

  private async emitOnFullEvent(
    clock: ClockEntity,
    advance: AdvanceClockDto,
  ): Promise<void> {
    let sessionId = advance.sessionId;
    if (!sessionId) {
      const latest = await this.sessionRepo.findOne({
        where: { campaignId: clock.campaignId },
        order: { updatedAt: "DESC" },
      });
      sessionId = latest?.id;
    }
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
