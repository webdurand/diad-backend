import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import type { BookendHiddenLayerContext } from "src/models/story-hidden-layer/domain/hidden-layer.types";
import type { BookendKind } from "../domain/bookend.types";
import type { BookendDecisionService } from "../services/bookend-decision.service";
import type {
  RenderBookendCeremonyUseCase,
  RenderBookendInput,
} from "./render-bookend-ceremony.use-case";
import type { PreviouslyOnResult } from "./build-previously-on.use-case";

const SILENCE_BEAT_MS = 2_000;

export interface BookendOrchestratorDeps {
  decisionService: BookendDecisionService;
  renderUseCase: Pick<RenderBookendCeremonyUseCase, "execute">;
  previouslyOnUseCase: {
    execute(input: { sessionId: string }): Promise<PreviouslyOnResult | null>;
  };
  eventPublisher: {
    publishPhaseCompleted(input: PhaseCompletedInput): Promise<void>;
    publishPreviouslyShown(input: PreviouslyShownInput): Promise<void>;
  };
  hiddenLayerContextPort?: {
    loadBookendContext(
      phaseTransitionId: string,
    ): Promise<BookendHiddenLayerContext | null>;
  };
  sleep?: (ms: number) => Promise<void>;
}

export interface PhaseCompletedInput {
  sessionId: string;
  campaignId: string;
  phaseTransitionId: string;
  fromPhaseIndex: number;
  toPhaseIndex: number;
  npcsAliveAtEnd?: string[];
  beatsExecuted?: string[];
  traceId?: string;
}

export interface PreviouslyShownInput {
  sessionId: string;
  campaignId: string;
  gapMinutes: number;
  source: PreviouslyOnResult["source"];
  traceId?: string;
}

export class BookendOrchestrator {
  constructor(private readonly deps: BookendOrchestratorDeps) {}

  async renderForPhaseChanged(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_changed") return;
    const sessionId = envelope.scope.sessionId;
    const campaignId = envelope.scope.campaignId;
    if (!sessionId || !campaignId) return;

    const payload = envelope.payload;
    const phaseTransitionId = stringOrNull(payload.phaseTransitionId);
    if (!phaseTransitionId) return;

    const fromPhase = recordOrEmpty(payload.fromPhase);
    const toPhase = recordOrEmpty(payload.toPhase);
    const fromPhaseIndex = numberOrDefault(fromPhase.index, 1);
    const toPhaseIndex = numberOrDefault(toPhase.index, fromPhaseIndex + 1);
    const traceId = envelope.source.traceId;

    await this.deps.eventPublisher.publishPhaseCompleted({
      sessionId,
      campaignId,
      phaseTransitionId,
      fromPhaseIndex,
      toPhaseIndex,
      beatsExecuted: arrayOfStrings(fromPhase.arcBeats),
      traceId,
    });
    const hiddenLayerContext = await this.loadHiddenLayerContext(phaseTransitionId);
    const baseInput = this.buildRenderInput(
      {
        sessionId,
        campaignId,
        phaseTransitionId,
        traceId,
      },
      hiddenLayerContext,
    );

    await this.renderOne("outro", baseInput);
    await this.sleep(SILENCE_BEAT_MS);
    await this.renderOne("intro", baseInput);

    const gapMinutes = numberOrDefault(payload.gapMinutes, 0);
    const shouldShowPreviously = this.deps.decisionService.shouldShowPreviously({
      gapMinutes,
      sceneNumber: numberOrDefault(payload.sceneNumber, 2),
      crossDay: payload.crossDay === true,
      phaseChangedSinceLastSession:
        payload.phaseChangedSinceLastSession === true,
      previouslySeen: payload.previouslySeen === true,
    });
    if (!shouldShowPreviously) return;

    const previous = await this.deps.previouslyOnUseCase.execute({ sessionId });
    await this.renderOne("previously_on", {
      ...baseInput,
      recapText: previous?.prose ?? null,
    });
    await this.deps.eventPublisher.publishPreviouslyShown({
      sessionId,
      campaignId,
      gapMinutes,
      source: previous?.source ?? "rewrapped",
      traceId,
    });
  }

  private renderOne(
    kind: BookendKind,
    input: Omit<RenderBookendInput, "kind">,
  ): Promise<unknown> {
    return this.deps.renderUseCase.execute({
      ...input,
      kind,
      twoBeatRequired: kind === "outro",
    });
  }

  private async loadHiddenLayerContext(
    phaseTransitionId: string,
  ): Promise<BookendHiddenLayerContext | null> {
    if (!this.deps.hiddenLayerContextPort) return null;
    return this.deps.hiddenLayerContextPort.loadBookendContext(phaseTransitionId);
  }

  private buildRenderInput(
    input: Omit<RenderBookendInput, "kind">,
    context: BookendHiddenLayerContext | null,
  ): Omit<RenderBookendInput, "kind"> {
    if (!context) return input;
    return {
      ...input,
      outcomeTier: context.outcomeTier ?? null,
      closingSeedFocus: context.closingSeed?.focus ?? null,
      closingSeedCrossroad: context.closingSeed?.crossroad ?? null,
      diegeticRitualResolved: context.diegeticRitualResolved ?? null,
      hiddenSecretSeed: context.closingSeed?.hiddenSecretSeed ?? null,
      xpTriggerState: context.xpTriggerState ?? null,
    };
  }

  private sleep(ms: number): Promise<void> {
    if (this.deps.sleep) return this.deps.sleep(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
