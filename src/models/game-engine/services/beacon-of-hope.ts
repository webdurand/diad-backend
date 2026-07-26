import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

export const BEACON_OF_HOPE_DURATION_ROUNDS = 10;

export function hasBeaconOfHope(
  participant:
    | Pick<EncounterParticipantEntity, "effectInstances">
    | null
    | undefined,
): boolean {
  return (
    participant?.effectInstances?.some(
      (effect) =>
        effect.kind === "beacon_of_hope" &&
        effect.requiresConcentration === true,
    ) ?? false
  );
}

export function hasBeaconWisdomSaveAdvantage(
  participant:
    | Pick<EncounterParticipantEntity, "effectInstances">
    | null
    | undefined,
  ability: string,
): boolean {
  return (
    ability.trim().toLowerCase().slice(0, 3) === "wis" &&
    hasBeaconOfHope(participant)
  );
}

export function beaconHealingAmount(
  participant:
    | Pick<EncounterParticipantEntity, "effectInstances">
    | null
    | undefined,
  rolledAmount: number,
  maximumAmount?: number,
): { amount: number; maximized: boolean } {
  const rolled = Math.max(0, Math.trunc(rolledAmount));
  const maximum =
    typeof maximumAmount === "number" && Number.isFinite(maximumAmount)
      ? Math.max(0, Math.trunc(maximumAmount))
      : rolled;
  const maximized = hasBeaconOfHope(participant) && maximum > rolled;
  return {
    amount: maximized ? maximum : rolled,
    maximized,
  };
}
