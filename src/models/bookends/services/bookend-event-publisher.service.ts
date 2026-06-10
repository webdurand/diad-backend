import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { GameSessionEntity } from "src/entities/game-session.entity";
import {
  BOOKEND_AUDIENCES,
  BOOKEND_READY_AUDIENCES,
  type BookendArtifactRecord,
  type BookendKind,
} from "../domain/bookend.types";
import type {
  PhaseCompletedInput,
  PreviouslyShownInput,
} from "../application/bookend-orchestrator";
import type { BookendEventPublisherPort } from "../application/render-bookend-ceremony.use-case";

@Injectable()
export class BookendEventPublisherService implements BookendEventPublisherPort {
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  async publishPhaseCompleted(input: PhaseCompletedInput): Promise<void> {
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "phase_completed",
        source: {
          service: "diad-backend",
          module: "BookendOrchestrator.renderForPhaseChanged",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: BOOKEND_AUDIENCES,
        payload: {
          sessionId: input.sessionId,
          phaseTransitionId: input.phaseTransitionId,
          fromPhaseIndex: input.fromPhaseIndex,
          toPhaseIndex: input.toPhaseIndex,
          npcsAliveAtEnd: input.npcsAliveAtEnd ?? [],
          beatsExecuted: input.beatsExecuted ?? [],
        },
        narrativeDescriptor: `Fase ${input.fromPhaseIndex} concluída → fase ${input.toPhaseIndex}`,
        metadata: { tags: ["narrative", "bookend"], narrativeWeight: 8 },
      }),
    );
  }

  async publishReady(input: {
    artifact: BookendArtifactRecord;
    traceId?: string;
    campaignId?: string;
  }): Promise<void> {
    const campaignId =
      input.campaignId ?? (await this.findCampaignId(input.artifact.gameSessionId));
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "bookend_ready",
        source: {
          service: "diad-backend",
          module: "RenderBookendCeremonyUseCase.execute",
          traceId: input.traceId,
        },
        scope: {
          campaignId,
          sessionId: input.artifact.gameSessionId,
        },
        audiences: BOOKEND_READY_AUDIENCES,
        payload: {
          sessionId: input.artifact.gameSessionId,
          bookendArtifactId: input.artifact.id,
          kind: input.artifact.kind,
          phaseTransitionId: input.artifact.phaseTransitionId ?? null,
          npcsReferenced: input.artifact.npcsReferenced,
          latencyMs: input.artifact.metadata.latencyMs,
          plannerCacheHit: input.artifact.metadata.plannerCacheHit ?? false,
          writerCacheHit: input.artifact.metadata.writerCacheHit ?? false,
        },
        narrativeDescriptor: `Bookend '${input.artifact.kind}' renderizado`,
        metadata: { tags: ["narrative", "bookend"], narrativeWeight: 8 },
      }),
    );
  }

  async publishFailed(input: {
    sessionId: string;
    phaseTransitionId?: string | null;
    kind: BookendKind;
    traceId?: string;
    campaignId?: string;
    code: string;
    invalidNpcIds?: string[];
  }): Promise<void> {
    const campaignId = input.campaignId ?? (await this.findCampaignId(input.sessionId));
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "bookend_failed",
        source: {
          service: "diad-backend",
          module: "RenderBookendCeremonyUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId, sessionId: input.sessionId },
        audiences: ["Director", "Archivist", "HUD"],
        payload: {
          sessionId: input.sessionId,
          phaseTransitionId: input.phaseTransitionId ?? null,
          kind: input.kind,
          code: input.code,
          invalidNpcIds: input.invalidNpcIds ?? [],
        },
        narrativeDescriptor: `Bookend '${input.kind}' caiu em fallback`,
        metadata: { tags: ["narrative", "bookend", "fallback"], narrativeWeight: 5 },
      }),
    );
  }

  async publishPreviouslyShown(input: PreviouslyShownInput): Promise<void> {
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "previously_on_shown",
        source: {
          service: "diad-backend",
          module: "BookendOrchestrator.renderForPhaseChanged",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: BOOKEND_READY_AUDIENCES,
        payload: {
          sessionId: input.sessionId,
          previousSessionId: null,
          gapMinutes: input.gapMinutes,
          source: input.source,
        },
        narrativeDescriptor: `Recap 'Previously on...' exibido após gap de ${input.gapMinutes}min`,
        metadata: { tags: ["narrative", "bookend", "previously_on"] },
      }),
    );
  }

  async publishSkipped(input: {
    sessionId: string;
    campaignId?: string;
    bookendArtifactId: string;
    kind: BookendKind;
    elapsedMs: number;
    traceId?: string;
  }): Promise<void> {
    const campaignId = input.campaignId ?? (await this.findCampaignId(input.sessionId));
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "bookend_skipped",
        source: {
          service: "diad-backend",
          module: "BookendArtifactService.markSkipped",
          traceId: input.traceId,
        },
        scope: { campaignId, sessionId: input.sessionId },
        audiences: BOOKEND_READY_AUDIENCES,
        payload: {
          sessionId: input.sessionId,
          bookendArtifactId: input.bookendArtifactId,
          kind: input.kind,
          elapsedMs: input.elapsedMs,
        },
        narrativeDescriptor: `Jogador pulou bookend '${input.kind}'`,
        metadata: { tags: ["narrative", "bookend", "skip"] },
      }),
    );
  }

  private async findCampaignId(sessionId: string): Promise<string | null> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId"],
    });
    return session?.campaignId ?? null;
  }
}
