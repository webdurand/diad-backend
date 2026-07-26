import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type {
  ConditionInstance,
  EffectInstance,
} from "../interfaces/combat.interfaces";

export const FREEDOM_OF_MOVEMENT_SLUG = "freedom-of-movement";
export const FREEDOM_OF_MOVEMENT_DURATION_ROUNDS = 600;
export const FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT = 5;

export function isFreedomOfMovementEffect(
  effect: Pick<EffectInstance, "kind" | "sourceSpellSlug">,
): boolean {
  return (
    effect.kind === "freedom_of_movement" ||
    effect.sourceSpellSlug?.toLowerCase().replace(/-(phb|xphb|srd52)$/, "") ===
      FREEDOM_OF_MOVEMENT_SLUG
  );
}

export function hasFreedomOfMovement(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): boolean {
  return (participant.effectInstances ?? []).some(isFreedomOfMovementEffect);
}

export function isMagicalCondition(
  condition: Pick<ConditionInstance, "source" | "sourceSpell">,
): boolean {
  return Boolean(
    condition.sourceSpell ||
    condition.source?.toLowerCase().startsWith("spell:"),
  );
}

export function isMagicalMobilityCondition(
  condition: Pick<ConditionInstance, "slug" | "source" | "sourceSpell">,
): boolean {
  return (
    (condition.slug === "paralyzed" || condition.slug === "restrained") &&
    isMagicalCondition(condition)
  );
}

export function isNonmagicalFreedomRestraint(
  condition: Pick<ConditionInstance, "slug" | "source" | "sourceSpell">,
): boolean {
  return (
    (condition.slug === "grappled" || condition.slug === "restrained") &&
    !isMagicalCondition(condition)
  );
}

export function isMagicalSpeedReduction(
  effect: Pick<
    EffectInstance,
    "kind" | "sourceSpellSlug" | "sourceFeatureSlug" | "payload"
  >,
): boolean {
  return (
    effect.kind === "speed_reduction" &&
    Boolean(effect.sourceSpellSlug || effect.payload?.magical)
  );
}
