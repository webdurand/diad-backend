import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { ConditionInstance } from "../interfaces/combat.interfaces";

export function findFearCompulsion(
  participant: Pick<EncounterParticipantEntity, "conditionInstances">,
): ConditionInstance | undefined {
  return (participant.conditionInstances ?? []).find(
    (instance) =>
      instance.slug === "frightened" &&
      instance.sourceSpell
        ?.toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "") === "fear",
  );
}

export function canSeeFearSource(
  source: Pick<EncounterParticipantEntity, "conditions" | "isDefeated"> | null,
): boolean {
  if (!source || source.isDefeated) return false;
  const conditions = new Set(source.conditions ?? []);
  return !conditions.has("hidden") && !conditions.has("invisible");
}
