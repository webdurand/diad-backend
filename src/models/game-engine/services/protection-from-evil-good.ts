import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type {
  ConditionSlug,
  EffectInstance,
} from "../interfaces/combat.interfaces";
import { getSummonMetadata, getSummonStatBlock } from "./summon-stat-block";

export const PROTECTION_FROM_EVIL_GOOD_CREATURE_TYPES = [
  "aberration",
  "celestial",
  "elemental",
  "fey",
  "fiend",
  "undead",
] as const;

function normalizeCreatureType(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object") {
    const typed = value as { index?: unknown; name?: unknown };
    return String(typed.index ?? typed.name ?? "")
      .trim()
      .toLowerCase();
  }
  return "";
}

export function participantCreatureType(
  participant:
    | Pick<
        EncounterParticipantEntity,
        "type" | "monster" | "appliedEffects"
      >
    | null
    | undefined,
): string {
  if (!participant) return "";

  const statBlock = getSummonStatBlock(participant);
  if (statBlock?.steed?.creatureType) {
    return statBlock.steed.creatureType;
  }
  if (statBlock?.kind === "elemental-spirit") return "elemental";
  if (statBlock?.kind === "bestial-spirit") return "beast";

  const summonMetadata = getSummonMetadata(participant);
  const summonCreatureType = normalizeCreatureType(
    summonMetadata?.creatureType ?? summonMetadata?.spiritType,
  );
  if (summonCreatureType) return summonCreatureType;

  const monsterCreatureType = normalizeCreatureType(participant.monster?.type);
  if (monsterCreatureType) return monsterCreatureType;
  return participant.type === "pc" ? "humanoid" : "";
}

export function isProtectedCreatureType(creatureType: string): boolean {
  const normalized = normalizeCreatureType(creatureType);
  return PROTECTION_FROM_EVIL_GOOD_CREATURE_TYPES.some((candidate) =>
    normalized.includes(candidate),
  );
}

export function hasProtectionFromEvilGood(
  effects: readonly EffectInstance[] | null | undefined,
): boolean {
  return (effects ?? []).some(
    (effect) => effect.kind === "protection_from_evil_good",
  );
}

export function protectionDisadvantagesAttack(
  targetEffects: readonly EffectInstance[] | null | undefined,
  attacker:
    | Pick<
        EncounterParticipantEntity,
        "type" | "monster" | "appliedEffects"
      >
    | null
    | undefined,
): boolean {
  return (
    hasProtectionFromEvilGood(targetEffects) &&
    isProtectedCreatureType(participantCreatureType(attacker))
  );
}

export function protectionBlocksCondition(
  targetEffects: readonly EffectInstance[] | null | undefined,
  condition: ConditionSlug,
  sourceCreatureType: string,
): boolean {
  const protectedCondition =
    condition === "charmed" ||
    condition === "frightened" ||
    condition === "hypnotized";
  return (
    protectedCondition &&
    hasProtectionFromEvilGood(targetEffects) &&
    isProtectedCreatureType(sourceCreatureType)
  );
}
