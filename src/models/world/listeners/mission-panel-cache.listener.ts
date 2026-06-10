import { Injectable } from "@nestjs/common";
import { EventListener } from "src/common/event-bus/event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "src/common/event-bus/event-envelope.types";
import { PhaseService } from "../services/phase.service";

const INVALIDATING_EVENTS = new Set([
  "main_quest_assigned",
  "phase_gate_pending",
  "phase_changed",
  "identity_tags_changed",
]);

@Injectable()
export class MissionPanelCacheListener implements EventListener {
  readonly name = "MissionPanelCacheListener";
  readonly categories: readonly EventCategory[] = [
    "WorldEvent",
    "NarrativeEvent",
  ];

  constructor(private readonly phaseService: PhaseService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!INVALIDATING_EVENTS.has(envelope.eventType)) return;
    this.phaseService.invalidateMainQuestCache(envelope.scope.sessionId);
  }
}
