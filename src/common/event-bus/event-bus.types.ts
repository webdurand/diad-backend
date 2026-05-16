import type { EventCategory, EventEnvelope } from "./event-envelope.types";


export interface EventListener {
  readonly name: string;
  readonly categories: readonly EventCategory[];
  handle(envelope: EventEnvelope): Promise<void>;
}


const EVENT_TYPE_CATALOG: Record<EventCategory, ReadonlySet<string>> = {
  EncounterEvent: new Set([
    "damage_applied",
    "condition_added",
    "condition_removed",
    "participant_died",
    "spell_cast",
    "attack_resolved",
    "concentration_broken",
    "tile_effect_triggered",
    "encounter_started",
    "encounter_ended",
    "encounter_started_from_narrative",
    "morale_check_failed",
    "dying_state_changed",
    "event_bus_overflow",
  ]),
  WorldEvent: new Set([
    "weather_changed",
    "chaos_factor_changed",
    "time_advanced",
    "period_changed",
    "location_revealed",
    "location_visited",
    "lighting_changed",
    "terrain_modified",
    "audience_map_changed",
    "event_bus_listener_failed",
    "quest_revealed",
    "quest_advanced",
    "quest_completed",
    "quest_failed",
    "main_quest_assigned",
    "phase_gate_pending",
    "phase_changed",
  ]),
  NarrativeEvent: new Set([
    "dialog_chosen",
    "lore_revealed",
    "quest_objective_completed",
    "persona_invoked",
    "narrative_decision_made",
    "voice_drift_detected",
    "tool_intent_rejected",
    "npc_moved",
    "npc_created",
    "revivify_eligibility_checked",
    "event_bus_listener_registered",
    "session_resumed",
    "scene_changed",
    "cold_open_generated",
    "phase_completed",
    "bookend_ready",
    "bookend_failed",
    "previously_on_shown",
    "bookend_skipped",
    "movement_lock_changed",
    "clock_progressed",
    "clock_filled",
    "clock_resolved",

    "npc_witnessed_event",
    "guard_dispatched",
    "mission_progress_advanced",
    "director_pull_injected",
  ]),
  SocialEvent: new Set([
    "companion_approval_changed",
    "companion_approval_threshold_crossed",
    "companion_recruited",
    "companion_dismissed",
    "companion_spoke",
    "companion_disagreement",
    "companion_relationship_phase_changed",
    "companion_romance_milestone",
    "disposition_changed",
    "reputation_shift",
    "companion_dialogue_unlocked",
    "bond_formed",
    "bond_broken",
    "item_lost",
    "item_awarded",
    "currency_changed",
    "loot_rolled",
    "healing_received",
    "hp_lost_narrative",
    "theft_from_pc",
    "theft_from_npc",

    "reputation_tag_added",
    "crime_committed",
  ]),
};

export function isEventTypeRegistered(
  category: EventCategory,
  eventType: string,
): boolean {
  const set = EVENT_TYPE_CATALOG[category];
  return set ? set.has(eventType) : false;
}
