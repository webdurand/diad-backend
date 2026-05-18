import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PhaseEntity } from "src/entities/phase.entity";
import { PhaseTransitionEntity } from "src/entities/phase-transition.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { DerivePhaseOutcomeUseCase } from "../application/derive-phase-outcome.use-case";
import type {
  ActiveXpTriggerState,
  MarkXpTriggerRepositoryPort,
} from "../application/mark-xp-trigger.use-case";
import type {
  ClosingSeedRepositoryPort,
  PhaseOpeningRecord,
} from "../application/commit-closing-seed.use-case";
import { ResolveDiegeticRitualUseCase } from "../application/resolve-diegetic-ritual.use-case";
import {
  createEmptyXpTriggerState,
  normalizeXpTriggerState,
  type BookendHiddenLayerContext,
  type ClosingSeedSnapshot,
  type DiegeticRitualKey,
  type OutcomeTier,
  type XpTriggerState,
} from "../domain/hidden-layer.types";
import { StoryHiddenLayerEventPublisherService } from "./story-hidden-layer-event-publisher.service";

@Injectable()
export class StoryHiddenLayerService
  implements MarkXpTriggerRepositoryPort, ClosingSeedRepositoryPort
{
  private readonly deriveOutcome = new DerivePhaseOutcomeUseCase();
  private readonly resolveRitual = new ResolveDiegeticRitualUseCase();

  constructor(
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly stateRepo: Repository<SessionStoryArcStateEntity>,
    @InjectRepository(PhaseEntity)
    private readonly phaseRepo: Repository<PhaseEntity>,
    @InjectRepository(PhaseTransitionEntity)
    private readonly transitionRepo: Repository<PhaseTransitionEntity>,
    private readonly events: StoryHiddenLayerEventPublisherService,
  ) {}

  async getCurrent(sessionId: string): Promise<ActiveXpTriggerState> {
    const state = await this.stateRepo.findOne({ where: { gameSessionId: sessionId } });
    if (!state) throw new NotFoundException("Estado narrativo da sessão não encontrado.");
    const phase = await this.phaseRepo.findOne({
      where: { storyArcId: state.storyArcId, index: state.currentPhaseIndex },
      select: ["id", "index"],
    });
    if (!phase) throw new NotFoundException("Fase atual não encontrada.");
    return {
      sessionId,
      phaseId: phase.id,
      phaseIndex: phase.index,
      xpTriggerState: normalizeXpTriggerState(state.xpTriggerState),
    };
  }

  async saveCurrent(input: ActiveXpTriggerState): Promise<XpTriggerState> {
    const xpTriggerState = normalizeXpTriggerState(input.xpTriggerState);
    await this.stateRepo.update(
      { gameSessionId: input.sessionId },
      { xpTriggerState },
    );
    return xpTriggerState;
  }

  async findPhaseForOpening(input: {
    phaseId?: string | null;
    storyArcId?: string | null;
    phaseIndex: number;
  }): Promise<PhaseOpeningRecord | null> {
    if (input.phaseId) {
      return this.phaseRepo.findOne({ where: { id: input.phaseId } });
    }
    if (!input.storyArcId) return null;
    return this.phaseRepo.findOne({
      where: { storyArcId: input.storyArcId, index: input.phaseIndex },
    });
  }

  async saveClosingSeed(
    phaseId: string,
    closingSeed: ClosingSeedSnapshot,
  ): Promise<void> {
    await this.phaseRepo.update({ id: phaseId }, { closingSeed });
  }

  async deriveOutcomeForPhaseCompleted(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseTransitionId: string;
    traceId?: string;
  }): Promise<BookendHiddenLayerContext | null> {
    const transition = await this.transitionRepo.findOne({
      where: { id: input.phaseTransitionId },
    });
    if (!transition) return null;

    const phase = await this.phaseRepo.findOne({
      where: {
        storyArcId: transition.storyArcId,
        index: transition.fromPhaseIndex,
      },
    });
    if (!phase) return null;

    const xpTriggerState = normalizeXpTriggerState(transition.xpTriggerState);
    const outcomeTier = this.deriveOutcome.execute(xpTriggerState);
    const diegeticRitualResolved = this.resolveRitual.execute({
      outcomeTier,
      emotionalArc: phase.emotionalArc,
      preferredHint: phase.closingSeed?.diegeticRitualHint ?? null,
    });

    await this.transitionRepo.update(
      { id: transition.id },
      {
        outcomeTier,
        xpTriggerState,
        diegeticRitualResolved,
      },
    );
    await this.events.publishPhaseOutcomeDerived({
      sessionId: input.sessionId,
      campaignId: input.campaignId ?? transition.gameSession?.campaignId ?? null,
      phaseTransitionId: transition.id,
      phaseIndex: transition.fromPhaseIndex,
      outcomeTier,
      xpTriggerState,
      diegeticRitualResolved,
      traceId: input.traceId,
    });

    return {
      outcomeTier,
      closingSeed: phase.closingSeed ?? null,
      diegeticRitualResolved,
      xpTriggerState,
      twoBeat: transition.twoBeat ?? null,
    };
  }

  async loadBookendContext(
    phaseTransitionId: string | null | undefined,
  ): Promise<BookendHiddenLayerContext | null> {
    if (!phaseTransitionId) return null;
    const transition = await this.transitionRepo.findOne({
      where: { id: phaseTransitionId },
    });
    if (!transition) return null;
    const phase = await this.phaseRepo.findOne({
      where: {
        storyArcId: transition.storyArcId,
        index: transition.fromPhaseIndex,
      },
    });
    return {
      outcomeTier: (transition.outcomeTier as OutcomeTier | null) ?? null,
      closingSeed: phase?.closingSeed ?? null,
      diegeticRitualResolved:
        (transition.diegeticRitualResolved as DiegeticRitualKey | null) ?? null,
      xpTriggerState: normalizeXpTriggerState(
        transition.xpTriggerState ?? createEmptyXpTriggerState(),
      ),
      twoBeat: transition.twoBeat ?? null,
    };
  }
}
