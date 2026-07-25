import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { EffectInstance } from "../interfaces/combat.interfaces";

const HASTE_ALLOWED_GENERIC_ACTIONS = new Set([
  "dash",
  "disengage",
  "hide",
  "use-object",
]);

function normalizeSpellSlug(slug: string | undefined): string {
  return (slug ?? "")
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");
}

export function findHasteExtraAction(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): EffectInstance | undefined {
  return (participant.effectInstances ?? []).find(
    (effect) =>
      effect.kind === "extra_action" &&
      normalizeSpellSlug(effect.sourceSpellSlug) === "haste",
  );
}

export function hasAvailableHasteAction(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): boolean {
  const effect = findHasteExtraAction(participant);
  return !!effect && effect.payload.usedThisTurn !== true;
}

export function canUseHasteForGenericAction(kind: string): boolean {
  return HASTE_ALLOWED_GENERIC_ACTIONS.has(kind);
}

export function consumeHasteAction(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): boolean {
  const effect = findHasteExtraAction(participant);
  if (!effect || effect.payload.usedThisTurn === true) return false;
  effect.payload = { ...effect.payload, usedThisTurn: true };
  return true;
}

export function resetHasteAction(
  participant: Pick<EncounterParticipantEntity, "effectInstances">,
): boolean {
  const effect = findHasteExtraAction(participant);
  if (!effect || effect.payload.usedThisTurn !== true) return false;
  effect.payload = { ...effect.payload, usedThisTurn: false };
  return true;
}

export function hasHasteDexSaveAdvantage(
  participant: Pick<EncounterParticipantEntity, "effectInstances"> | null | undefined,
  ability: string,
): boolean {
  return ability.toLowerCase() === "dex" && !!findHasteExtraAction(participant ?? {
    effectInstances: [],
  });
}
