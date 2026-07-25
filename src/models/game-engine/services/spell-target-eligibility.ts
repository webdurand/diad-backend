import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

export function isHumanoidSpellTarget(
  participant: Pick<EncounterParticipantEntity, "type" | "monster">,
): boolean {
  if (participant.monster?.type) {
    return participant.monster.type.toLowerCase().includes("humanoid");
  }
  return participant.type === "pc" || participant.type === "npc";
}
