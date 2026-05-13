import type { SaveAbility } from "../interfaces/combat.interfaces";



export type TileEffectKind =
  | "grease"
  | "web"
  | "fog-cloud"
  | "spike-growth"
  | "wall-of-fire"
  | "cloud-of-daggers"
  | "sleet-storm"
  | "spirit-guardians";

export type TileEffectDirection =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export interface TileEffectOriginCell {
  x: number;
  y: number;
  direction?: TileEffectDirection | null;
  end?: { x: number; y: number } | null;
}

export type ConditionSlug = "prone" | "restrained" | "blinded";

export interface SaveSpec {
  ability: SaveAbility;

  halfOnSave?: boolean;

  onFailCondition?: ConditionSlug;

  affectsConcentration?: boolean;
}

export interface DamageSpec {

  expressionPerSlot: (slot: number) => string;
  type: string;
}

export type TileEffectTrigger =
  | { kind: "on-cast"; save?: SaveSpec; damage?: DamageSpec }
  | { kind: "on-enter"; save?: SaveSpec; damage?: DamageSpec }
  | { kind: "on-move-through"; damagePerCell: DamageSpec }
  | { kind: "on-start-turn-in"; save?: SaveSpec; damage?: DamageSpec }
  | { kind: "on-end-turn-adjacent"; damage: DamageSpec; range: number }
  | { kind: "on-pass-through-wall"; damage: DamageSpec };

export interface TileEffectTactical {
  tags: string[];

  tacticalValue: number;
  beneficiaryFaction: "caster" | "allies" | "neutral";
  creatureAffinity?: { high?: string[]; low?: string[] };
}

export interface TileEffectDefinition {
  spellSlug: string;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";

  defaultRadiusCells: (slot: number) => number;
  isDifficultTerrain: boolean;

  speedMultiplier?: number;

  durationRoundsAtSlot: (slot: number) => number | null;
  sourceConcentration: boolean;
  triggers: TileEffectTrigger[];
  tactical: TileEffectTactical;

  narrativeDescriptor: string;

  auraFollowsCaster?: boolean;
}




function bySlotLinear(
  baseSlot: number,
  baseDice: number,
  type: string,
  diceSize: number,
  extraDicePerSlotAbove: number,
): DamageSpec {
  return {
    expressionPerSlot: (slot) => {
      const totalDice =
        baseDice + extraDicePerSlotAbove * Math.max(0, slot - baseSlot);
      return `${totalDice}d${diceSize}`;
    },
    type,
  };
}


function fixedDamage(dice: number, diceSize: number, type: string): DamageSpec {
  return {
    expressionPerSlot: () => `${dice}d${diceSize}`,
    type,
  };
}



export const TILE_EFFECT_CATALOG: Record<TileEffectKind, TileEffectDefinition> =
  {

    grease: {
      spellSlug: "grease",
      shapeKind: "cube",
      defaultRadiusCells: () => 2,
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [
        { kind: "on-cast", save: { ability: "dex", onFailCondition: "prone" } },
        {
          kind: "on-enter",
          save: { ability: "dex", onFailCondition: "prone" },
        },
      ],
      tactical: {
        tags: ["control", "difficult-terrain", "prone", "denial"],
        tacticalValue: 6,
        beneficiaryFaction: "caster",
        creatureAffinity: { low: ["flying", "amorphous"] },
      },
      narrativeDescriptor:
        "Graxa escorregadia cobre o chão; pés deslizam sem firmeza.",
    },


    web: {
      spellSlug: "web",
      shapeKind: "cube",
      defaultRadiusCells: () => 4,
      isDifficultTerrain: true,
      speedMultiplier: 0,
      durationRoundsAtSlot: () => 600,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-cast",
          save: { ability: "dex", onFailCondition: "restrained" },
        },
        {
          kind: "on-enter",
          save: { ability: "dex", onFailCondition: "restrained" },
        },
      ],
      tactical: {
        tags: ["control", "restrained", "difficult-terrain", "denial"],
        tacticalValue: 7,
        beneficiaryFaction: "caster",
        creatureAffinity: { low: ["flying", "amorphous"] },
      },
      narrativeDescriptor:
        "Teias densas se estendem entre o chão e o teto, agarrando quem entra.",
    },



    "fog-cloud": {
      spellSlug: "fog-cloud",
      shapeKind: "sphere",
      defaultRadiusCells: (slot) => 4 + Math.max(0, slot - 1) * 4,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 600,
      sourceConcentration: true,
      triggers: [],
      tactical: {
        tags: ["control", "obscurement", "vision-block", "fog"],
        tacticalValue: 6,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Névoa espessa obscurece a área; silhuetas somem a poucos passos.",
    },



    "spike-growth": {
      spellSlug: "spike-growth",
      shapeKind: "sphere",
      defaultRadiusCells: () => 4,
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-move-through",
          damagePerCell: fixedDamage(2, 4, "piercing"),
        },
      ],
      tactical: {
        tags: [
          "damage",
          "difficult-terrain",
          "denial",
          "forced-movement-amplifier",
        ],
        tacticalValue: 8,
        beneficiaryFaction: "caster",
        creatureAffinity: { low: ["flying"] },
      },
      narrativeDescriptor:
        "Espinhos curvos brotam do solo, ferindo quem se move sobre eles.",
    },



    "wall-of-fire": {
      spellSlug: "wall-of-fire",
      shapeKind: "line",
      defaultRadiusCells: () => 12,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-cast",
          save: { ability: "dex", halfOnSave: true },
          damage: bySlotLinear(4, 5, "fire", 8, 1),
        },
        {
          kind: "on-pass-through-wall",
          damage: bySlotLinear(4, 5, "fire", 8, 1),
        },
        {
          kind: "on-end-turn-adjacent",
          damage: bySlotLinear(4, 5, "fire", 8, 1),
          range: 1,
        },
      ],
      tactical: {
        tags: ["damage", "wall", "area-denial", "fire"],
        tacticalValue: 8,
        beneficiaryFaction: "caster",
        creatureAffinity: { high: ["fire-immune"], low: ["fire-vulnerable"] },
      },
      narrativeDescriptor:
        "Parede de chamas ruge a 6 metros de altura; o calor pulsa do lado escolhido.",
    },


    "cloud-of-daggers": {
      spellSlug: "cloud-of-daggers",
      shapeKind: "cube",
      defaultRadiusCells: () => 1,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [
        { kind: "on-cast", damage: bySlotLinear(2, 4, "slashing", 4, 2) },
        { kind: "on-enter", damage: bySlotLinear(2, 4, "slashing", 4, 2) },
        {
          kind: "on-start-turn-in",
          damage: bySlotLinear(2, 4, "slashing", 4, 2),
        },
      ],
      tactical: {
        tags: ["damage", "area-denial", "slashing"],
        tacticalValue: 6,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Lâminas espectrais giram em círculo, cortando o ar com precisão letal.",
    },



    "sleet-storm": {
      spellSlug: "sleet-storm",
      shapeKind: "cylinder",
      defaultRadiusCells: () => 4,
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-enter",
          save: {
            ability: "dex",
            onFailCondition: "prone",
            affectsConcentration: true,
          },
        },
        {
          kind: "on-start-turn-in",
          save: {
            ability: "dex",
            onFailCondition: "prone",
            affectsConcentration: true,
          },
        },
      ],
      tactical: {
        tags: [
          "control",
          "prone",
          "difficult-terrain",
          "concentration-break",
          "vision-block",
        ],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        creatureAffinity: { low: ["concentration-dependent"] },
      },
      narrativeDescriptor:
        "Granizo cortante e gelo escorregadio caem em redemoinho dentro do cilindro.",
    },



    "spirit-guardians": {
      spellSlug: "spirit-guardians",
      shapeKind: "sphere",
      defaultRadiusCells: () => 3,
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: true,
      auraFollowsCaster: true,
      triggers: [
        {
          kind: "on-start-turn-in",
          save: { ability: "wis", halfOnSave: true },
          damage: bySlotLinear(3, 3, "radiant", 8, 1),
        },
      ],
      tactical: {
        tags: ["damage", "aura", "difficult-terrain", "radiant"],
        tacticalValue: 8,
        beneficiaryFaction: "caster",
        creatureAffinity: { low: ["undead", "fiend"] },
      },
      narrativeDescriptor:
        "Guardiões espectrais orbitam o conjurador, cintilando em luz divina.",
    },
  };


export function getTileEffectDefinition(
  slug: string,
): TileEffectDefinition | null {
  const normalized = slug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
  return TILE_EFFECT_CATALOG[normalized as TileEffectKind] ?? null;
}
