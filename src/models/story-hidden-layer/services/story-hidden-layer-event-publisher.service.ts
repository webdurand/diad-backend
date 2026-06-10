import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventAudience } from "src/common/event-bus/event-envelope.types";
import { GameSessionEntity } from "src/entities/game-session.entity";
import type {
  ClosingSeedEventPort,
} from "../application/commit-closing-seed.use-case";
import type { MarkXpTriggerEventPort } from "../application/mark-xp-trigger.use-case";
import type {
  DiegeticRitualKey,
  OutcomeTier,
  XpTriggerKind,
  XpTriggerState,
} from "../domain/hidden-layer.types";

const HIDDEN_LAYER_AUDIENCES: EventAudience[] = [
  "Director",
  "Narrator",
  "Archivist",
];

@Injectable()
export class StoryHiddenLayerEventPublisherService
  implements ClosingSeedEventPort, MarkXpTriggerEventPort
{
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  async publishPhaseOpened(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseId: string;
    phaseIndex: number;
    closingSeedCommittedAt: string;
    traceId?: string;
  }): Promise<void> {
    const campaignId = input.campaignId ?? (await this.findCampaignId(input.sessionId));
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "phase_opened",
        source: {
          service: "diad-backend",
          module: "CommitClosingSeedUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId, sessionId: input.sessionId },
        audiences: HIDDEN_LAYER_AUDIENCES,
        payload: {
          sessionId: input.sessionId,
          phaseId: input.phaseId,
          phaseIndex: input.phaseIndex,
          closingSeedCommittedAt: input.closingSeedCommittedAt,
        },
        narrativeDescriptor: `Fase ${input.phaseIndex} aberta com closing seed comprometido`,
        metadata: { tags: ["narrative", "hidden_layer"], narrativeWeight: 7 },
      }),
    );
  }

  async publishXpTriggerMarked(input: {
    sessionId: string;
    phaseId?: string | null;
    phaseIndex: number;
    triggerKind: XpTriggerKind;
    totalMarked: number;
    traceId?: string;
  }): Promise<void> {
    const campaignId = await this.findCampaignId(input.sessionId);
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "xp_trigger_marked",
        source: {
          service: "diad-backend",
          module: "MarkXpTriggerUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId, sessionId: input.sessionId },
        audiences: ["Director", "Archivist"],
        payload: {
          sessionId: input.sessionId,
          phaseId: input.phaseId ?? null,
          triggerKind: input.triggerKind,
          totalMarked: input.totalMarked,
        },
        narrativeDescriptor: `XP trigger '${input.triggerKind}' marcado (${input.totalMarked}/5)`,
        metadata: { tags: ["narrative", "xp_trigger"], narrativeWeight: 6 },
      }),
    );
  }

  async publishPhaseOutcomeDerived(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseTransitionId: string;
    phaseIndex: number;
    outcomeTier: OutcomeTier;
    xpTriggerState: XpTriggerState;
    diegeticRitualResolved: DiegeticRitualKey;
    traceId?: string;
  }): Promise<void> {
    const campaignId = input.campaignId ?? (await this.findCampaignId(input.sessionId));
    if (!campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "phase_outcome_derived",
        source: {
          service: "diad-backend",
          module: "DerivePhaseOutcomeUseCase.onPhaseCompleted",
          traceId: input.traceId,
        },
        scope: { campaignId, sessionId: input.sessionId },
        audiences: HIDDEN_LAYER_AUDIENCES,
        payload: {
          sessionId: input.sessionId,
          phaseTransitionId: input.phaseTransitionId,
          outcomeTier: input.outcomeTier,
          xpTriggerState: input.xpTriggerState,
          diegeticRitualResolved: input.diegeticRitualResolved,
        },
        narrativeDescriptor: `Fase ${input.phaseIndex} fechou em ${input.outcomeTier}`,
        metadata: { tags: ["narrative", "outcome_tier"], narrativeWeight: 8 },
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
