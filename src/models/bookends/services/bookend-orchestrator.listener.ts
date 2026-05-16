import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { SessionRecapService } from "src/models/session/services/session-recap.service";
import { BookendOrchestrator } from "../application/bookend-orchestrator";
import { BuildPreviouslyOnUseCase } from "../application/build-previously-on.use-case";
import { BookendDecisionService } from "./bookend-decision.service";
import { BookendEventPublisherService } from "./bookend-event-publisher.service";
import { BookendRendererService } from "./bookend-renderer.service";

@Injectable()
export class BookendOrchestratorListener implements EventListener {
  readonly name = "BookendOrchestrator";
  readonly categories = ["WorldEvent"] as const;

  constructor(
    private readonly decisionService: BookendDecisionService,
    private readonly renderer: BookendRendererService,
    private readonly recapService: SessionRecapService,
    private readonly eventPublisher: BookendEventPublisherService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(BookendOrchestratorListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_changed") return;
    void this.render(envelope);
  }

  private async render(envelope: EventEnvelope): Promise<void> {
    try {
      const orchestrator = new BookendOrchestrator({
        decisionService: this.decisionService,
        renderUseCase: this.renderer,
        previouslyOnUseCase: new BuildPreviouslyOnUseCase(this.recapService),
        eventPublisher: this.eventPublisher,
      });
      await orchestrator.renderForPhaseChanged(envelope);
    } catch (err) {
      this.logger.error("bookend.orchestrator.failed", err, {
        "event.id": envelope.eventId,
        "event.type": envelope.eventType,
        "trace.id": envelope.source.traceId,
      });
    }
  }
}
