import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

export type SummonBeastForm = "air" | "land" | "water";
export type SummonElementalForm = "air" | "earth" | "fire" | "water";
export type FamiliarForm =
  | "bat"
  | "cat"
  | "crab"
  | "frog"
  | "hawk"
  | "lizard"
  | "octopus"
  | "owl"
  | "poisonous-snake"
  | "quipper"
  | "rat"
  | "raven"
  | "sea-horse"
  | "spider"
  | "weasel";
export type FamiliarCreatureType = "celestial" | "fey" | "fiend";
export type SteedAppearance = "horse" | "camel" | "dire-wolf" | "elk";
export type SteedCreatureType = FamiliarCreatureType;

export interface SummonStatBlock {
  kind: "bestial-spirit" | "elemental-spirit" | "otherworldly-steed";
  form: SummonBeastForm | SummonElementalForm | SteedAppearance;
  slotLevel: number;
  armorClass: number;
  maxHp: number;
  speed: number;
  movementModes: {
    walk: number;
    fly?: number;
    climb?: number;
    swim?: number;
    burrow?: number;
  };
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  attack: {
    name: "Rend" | "Slam" | "Otherworldly Slam";
    attackBonus: number;
    damageDice: "1d8" | "1d10";
    damageBonus: number;
    damageType:
      | "piercing"
      | "bludgeoning"
      | "cold"
      | "lightning"
      | "fire"
      | "radiant"
      | "psychic"
      | "necrotic";
    reachFt: 5;
    attacksPerAction: number;
  };
  traits: {
    flyby: boolean;
    packTactics: boolean;
    waterBreathing: boolean;
    amorphousForm: boolean;
    hover: boolean;
    lifeBond?: boolean;
  };
  steed?: {
    creatureType: SteedCreatureType;
    spellSaveDc: number;
    bonusAction:
      | "healing-touch"
      | "fey-step"
      | "fell-glare";
  };
}

export function buildBestialSpiritStatBlock(input: {
  form: SummonBeastForm;
  slotLevel: number;
  spellAttackBonus: number;
}): SummonStatBlock {
  const slotLevel = Math.max(2, Math.trunc(input.slotLevel));
  const air = input.form === "air";
  const maxHp = (air ? 20 : 30) + 5 * (slotLevel - 2);
  const movementModes =
    input.form === "air"
      ? { walk: 30, fly: 60 }
      : input.form === "land"
        ? { walk: 30, climb: 30 }
        : { walk: 30, swim: 30 };

  return {
    kind: "bestial-spirit",
    form: input.form,
    slotLevel,
    armorClass: 11 + slotLevel,
    maxHp,
    speed: Math.max(...Object.values(movementModes)),
    movementModes,
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    attack: {
      name: "Rend",
      attackBonus: input.spellAttackBonus,
      damageDice: "1d8",
      damageBonus: 4 + slotLevel,
      damageType: "piercing",
      reachFt: 5,
      attacksPerAction: Math.floor(slotLevel / 2),
    },
    traits: {
      flyby: air,
      packTactics: !air,
      waterBreathing: input.form === "water",
      amorphousForm: false,
      hover: false,
    },
  };
}

export function buildElementalSpiritStatBlock(input: {
  form: SummonElementalForm;
  slotLevel: number;
  spellAttackBonus: number;
}): SummonStatBlock {
  const slotLevel = Math.max(4, Math.trunc(input.slotLevel));
  const movementModes =
    input.form === "air"
      ? { walk: 40, fly: 40 }
      : input.form === "earth"
        ? { walk: 40, burrow: 40 }
        : input.form === "water"
          ? { walk: 40, swim: 40 }
          : { walk: 40 };
  const damageType =
    input.form === "air"
      ? "lightning"
      : input.form === "earth"
        ? "bludgeoning"
        : input.form === "fire"
          ? "fire"
          : "cold";

  return {
    kind: "elemental-spirit",
    form: input.form,
    slotLevel,
    armorClass: 11 + slotLevel,
    maxHp: 50 + 10 * (slotLevel - 4),
    speed: Math.max(...Object.values(movementModes)),
    movementModes,
    damageResistances:
      input.form === "air"
        ? ["lightning", "thunder"]
        : input.form === "earth"
          ? ["piercing", "slashing"]
          : input.form === "water"
            ? ["acid"]
            : [],
    damageImmunities:
      input.form === "fire" ? ["poison", "fire"] : ["poison"],
    conditionImmunities: ["exhaustion", "paralyzed", "petrified", "poisoned"],
    attack: {
      name: "Slam",
      attackBonus: input.spellAttackBonus,
      damageDice: "1d10",
      damageBonus: 4 + slotLevel,
      damageType,
      reachFt: 5,
      attacksPerAction: Math.floor(slotLevel / 2),
    },
    traits: {
      flyby: false,
      packTactics: false,
      waterBreathing: false,
      amorphousForm: input.form !== "earth",
      hover: input.form === "air",
    },
  };
}

export function buildOtherworldlySteedStatBlock(input: {
  appearance: SteedAppearance;
  creatureType: SteedCreatureType;
  slotLevel: number;
  spellAttackBonus: number;
  spellSaveDc: number;
}): SummonStatBlock {
  const slotLevel = Math.max(2, Math.trunc(input.slotLevel));
  const damageType =
    input.creatureType === "celestial"
      ? "radiant"
      : input.creatureType === "fey"
        ? "psychic"
        : "necrotic";
  const bonusAction =
    input.creatureType === "celestial"
      ? "healing-touch"
      : input.creatureType === "fey"
        ? "fey-step"
        : "fell-glare";
  const movementModes =
    slotLevel >= 4 ? { walk: 60, fly: 60 } : { walk: 60 };

  return {
    kind: "otherworldly-steed",
    form: input.appearance,
    slotLevel,
    armorClass: 10 + slotLevel,
    maxHp: 5 + 10 * slotLevel,
    speed: 60,
    movementModes,
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    attack: {
      name: "Otherworldly Slam",
      attackBonus: input.spellAttackBonus,
      damageDice: "1d8",
      damageBonus: slotLevel,
      damageType,
      reachFt: 5,
      attacksPerAction: 1,
    },
    traits: {
      flyby: false,
      packTactics: false,
      waterBreathing: false,
      amorphousForm: false,
      hover: false,
      lifeBond: true,
    },
    steed: {
      creatureType: input.creatureType,
      spellSaveDc: input.spellSaveDc,
      bonusAction,
    },
  };
}

export function getSummonStatBlock(
  participant:
    | Pick<EncounterParticipantEntity, "appliedEffects">
    | null
    | undefined,
): SummonStatBlock | null {
  const effect = (participant?.appliedEffects ?? []).find(
    (candidate) =>
      candidate.kind === "summon" &&
      candidate.metadata?.statBlock &&
      typeof candidate.metadata.statBlock === "object",
  );
  return (effect?.metadata?.statBlock as SummonStatBlock | undefined) ?? null;
}

export function getSummonMetadata(
  participant:
    | Pick<EncounterParticipantEntity, "appliedEffects">
    | null
    | undefined,
): Record<string, unknown> | null {
  const effect = (participant?.appliedEffects ?? []).find(
    (candidate) => candidate.kind === "summon",
  );
  if (!effect) return null;
  return {
    source: effect.metadata?.source ?? effect.refId,
    ...(effect.metadata ?? {}),
  };
}

export function isFindFamiliarSummon(
  participant:
    | Pick<EncounterParticipantEntity, "appliedEffects">
    | null
    | undefined,
): boolean {
  return getSummonMetadata(participant)?.source === "find-familiar-spell";
}

export function isFindSteedSummon(
  participant:
    | Pick<EncounterParticipantEntity, "appliedEffects">
    | null
    | undefined,
): boolean {
  return getSummonMetadata(participant)?.source === "find-steed-spell";
}
