import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionFactionStateEntity } from "src/entities/session-faction-state.entity";
import { FactionEntity } from "src/entities/faction.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";

export interface UpsertFactionStateDto {
  isKnownToParty?: boolean;
  disposition?: "friendly" | "neutral" | "hostile" | "indifferent";
  reputation?: number;
}

@Injectable()
export class SessionFactionStateService {
  constructor(
    @InjectRepository(SessionFactionStateEntity)
    private readonly repo: Repository<SessionFactionStateEntity>,
    @InjectRepository(FactionEntity)
    private readonly factionRepo: Repository<FactionEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  async getOrCreate(
    gameSessionId: string,
    factionId: string,
  ): Promise<SessionFactionStateEntity> {
    const found = await this.repo.findOne({
      where: { gameSessionId, factionId },
    });
    if (found) return found;
    const created = this.repo.create({ gameSessionId, factionId });
    return this.repo.save(created);
  }

  async upsert(
    gameSessionId: string,
    factionId: string,
    patch: UpsertFactionStateDto,
    source?: string,
  ): Promise<SessionFactionStateEntity> {
    const state = await this.getOrCreate(gameSessionId, factionId);
    const previousReputation = state.reputation;
    if (patch.isKnownToParty !== undefined) {
      state.isKnownToParty = patch.isKnownToParty;
    }
    if (patch.disposition !== undefined) state.disposition = patch.disposition;
    if (patch.reputation !== undefined) state.reputation = patch.reputation;
    const saved = await this.repo.save(state);

    if (
      patch.reputation !== undefined &&
      patch.reputation !== previousReputation
    ) {
      await this.publishReputationShift(
        gameSessionId,
        factionId,
        previousReputation,
        patch.reputation,
        source ?? "upsert",
      );
    }

    return saved;
  }

  /**
   * Atualiza reputação por delta (positivo ou negativo). Emite
   * `SocialEvent.reputation_shift` com payload completo. Usado por listeners
   * (e.g. quest reward) e pela narrativa quando NPC importante reage.
   */
  async applyDelta(
    gameSessionId: string,
    factionId: string,
    delta: number,
    source: string,
  ): Promise<SessionFactionStateEntity> {
    if (!delta) {
      return this.getOrCreate(gameSessionId, factionId);
    }
    const state = await this.getOrCreate(gameSessionId, factionId);
    const previousReputation = state.reputation;
    state.reputation = previousReputation + delta;
    const saved = await this.repo.save(state);
    await this.publishReputationShift(
      gameSessionId,
      factionId,
      previousReputation,
      saved.reputation,
      source,
    );
    return saved;
  }

  async listBySession(
    gameSessionId: string,
  ): Promise<SessionFactionStateEntity[]> {
    return this.repo.find({ where: { gameSessionId } });
  }

  private async publishReputationShift(
    gameSessionId: string,
    factionId: string,
    previousValue: number,
    newValue: number,
    source: string,
  ): Promise<void> {
    try {
      const faction = await this.factionRepo.findOne({
        where: { id: factionId },
        select: { id: true, name: true, campaignId: true },
      });
      if (!faction?.campaignId) return;
      const envelope = this.envelopeFactory.build({
        eventCategory: "SocialEvent",
        eventType: "reputation_shift",
        source: {
          service: "diad-backend",
          module: "SessionFactionStateService.publishReputationShift",
        },
        scope: { campaignId: faction.campaignId, sessionId: gameSessionId },
        payload: {
          factionId,
          factionName: faction.name,
          previousValue,
          newValue,
          delta: newValue - previousValue,
          source,
        },
        narrativeDescriptor: `Reputação com ${faction.name}: ${previousValue} → ${newValue}`,
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort */
    }
  }
}
