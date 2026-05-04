import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type ChaosSource = "player" | "director" | "event";

/**
 * Spec 019 — chaos factor é DM-controlled (Director agent ou consequência
 * narrativa). Após split mundo↔aventura, chaos vive em game_sessions
 * (estado da aventura) e não em campaigns.
 */
@Injectable()
export class ChaosFactorService {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async setChaosFactor(
    gameSessionId: string,
    value: number,
    source: ChaosSource,
    options: { traceId?: string } = {},
  ): Promise<{ sessionId: string; oldValue: number; newValue: number }> {
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      throw new DomainException(
        ErrorCode.CHAOS_OUT_OF_RANGE,
        `chaosFactor deve ser inteiro 1..9 (recebido: ${value}).`,
        { context: { value }, hint: "Mythic GME chaos: 1=ordem, 9=caos." },
      );
    }
    const session = await this.sessionRepo.findOne({
      where: { id: gameSessionId },
    });
    if (!session) {
      throw new DomainException(
        ErrorCode.CAMPAIGN_NOT_FOUND,
        `GameSession ${gameSessionId} não encontrada.`,
      );
    }
    const oldValue = session.chaosFactor;
    if (oldValue === value) {
      return { sessionId: gameSessionId, oldValue, newValue: value };
    }
    session.chaosFactor = value;
    await this.sessionRepo.save(session);

    if (session.campaignId) {
      const envelope = this.factory.build({
        eventCategory: "WorldEvent",
        eventType: "chaos_factor_changed",
        source: {
          service: "diad-backend",
          module: "ChaosFactorService.setChaosFactor",
          traceId: options.traceId,
        },
        scope: { campaignId: session.campaignId, sessionId: gameSessionId },
        payload: {
          sessionId: gameSessionId,
          campaignId: session.campaignId,
          oldValue,
          newValue: value,
          source,
        },
        narrativeDescriptor:
          value > oldValue
            ? "O caos cresce — algo está se movendo."
            : "A tensão se acalma momentaneamente.",
      });
      try {
        await this.eventBus.publish(envelope);
      } catch {
        /* best-effort */
      }
    }

    return { sessionId: gameSessionId, oldValue, newValue: value };
  }
}
