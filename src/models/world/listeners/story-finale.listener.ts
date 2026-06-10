import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ClockEntity } from "src/entities/clock.entity";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventListener } from "src/common/event-bus/event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

const FINALE_CLOCK_NAME = "O Desfecho";
const DEFEAT_CLOCK_NAME = "A Queda";

const FINALE_SEED =
  "A campanha chegou ao seu desfecho: narre o clímax final se resolvendo, " +
  "as consequências concretas das escolhas do herói ao longo da jornada e um " +
  "epílogo curto com gosto de fim. Encerre com dignidade — sem gancho de próxima cena.";

const DEFEAT_SEED =
  "A missão principal falhou em definitivo: narre a derrota se consumando, o " +
  "custo para o mundo e para quem o herói amava, e um epílogo sóbrio de fim de " +
  "campanha. Sem gancho de continuação — a queda também merece cerimônia.";

// Spec 052: o fim da campanha vira cerimônia. story_completed/quest_failed(main)
// semeiam um clock invisível já cheio cujo onFullAction.narrativeSeed é a
// diretiva de desfecho — o executor da 049 (narrator world snapshot) garante
// que a PRÓXIMA narração abra com o finale e consome a obrigação uma única vez.
@Injectable()
export class StoryFinaleListener implements EventListener {
  readonly name = "StoryFinaleListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly arcStateRepo: Repository<SessionStoryArcStateEntity>,
    @InjectRepository(ClockEntity)
    private readonly clockRepo: Repository<ClockEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(StoryFinaleListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    const sessionId = envelope.scope.sessionId ?? envelope.payload?.sessionId;
    if (!sessionId || typeof sessionId !== "string") return;

    if (envelope.eventType === "story_completed") {
      if (await this.alreadyProcessed(envelope.eventId)) return;
      await this.seedConsequenceClock(envelope, sessionId, {
        name: FINALE_CLOCK_NAME,
        seed: FINALE_SEED,
        trigger: "climax_phase",
      });
      await this.markProcessed(envelope.eventId);
      return;
    }

    if (
      envelope.eventType === "quest_failed" &&
      envelope.payload?.isMainQuest === true
    ) {
      if (await this.alreadyProcessed(envelope.eventId)) return;
      await this.finalizeDefeat(envelope, sessionId);
      await this.markProcessed(envelope.eventId);
    }
  }

  private async finalizeDefeat(
    envelope: EventEnvelope,
    sessionId: string,
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) return;

    const arcState = await this.arcStateRepo.findOne({
      where: { gameSessionId: sessionId },
      order: { updatedAt: "DESC" },
    });
    if (arcState && arcState.currentPhase !== "completed") {
      arcState.currentPhase = "failed";
      await this.arcStateRepo.save(arcState);
    }
    if (session.status !== "completed") {
      session.status = "completed";
      session.endedAt = new Date();
      await this.sessionRepo.save(session);
    }

    const failed = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType: "story_failed",
      source: {
        service: "diad-backend",
        module: "StoryFinaleListener",
        traceId: envelope.source.traceId,
      },
      scope: {
        campaignId: envelope.scope.campaignId,
        sessionId,
      },
      payload: {
        sessionId,
        questId: envelope.payload?.questId ?? null,
        questName: envelope.payload?.questName ?? null,
        evidence: envelope.payload?.evidence ?? null,
      },
      audiences: ["Narrator", "Director", "HUD"],
      narrativeDescriptor: "A missão principal falhou — a campanha termina em derrota.",
    });
    await this.eventBus.publish(failed);

    await this.seedConsequenceClock(envelope, sessionId, {
      name: DEFEAT_CLOCK_NAME,
      seed: DEFEAT_SEED,
      trigger: "climax_phase",
    });
  }

  private async seedConsequenceClock(
    envelope: EventEnvelope,
    sessionId: string,
    input: { name: string; seed: string; trigger: "climax_phase" },
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId"],
    });
    if (!session?.campaignId) return;

    const existing = await this.clockRepo.findOne({
      where: { gameSessionId: sessionId, name: input.name },
    });
    if (existing) return;

    await this.clockRepo.save(
      this.clockRepo.create({
        campaignId: session.campaignId,
        gameSessionId: sessionId,
        name: input.name,
        segments: 1,
        filled: 1,
        status: "filled",
        type: "main",
        visibleToPlayer: false,
        onFullAction: {
          trigger: input.trigger,
          narrativeSeed: input.seed,
        },
        advanceRules: {},
      }),
    );
    this.logger.info("story_finale.consequence_seeded", {
      "session.id": sessionId,
      "clock.name": input.name,
      "event.id": envelope.eventId,
    });
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
      this.logger.warn("story_finale.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
