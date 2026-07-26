import type { SaveAbility } from "../interfaces/combat.interfaces";



export type TileEffectKind =
  | "grease"
  | "web"
  | "fog-cloud"
  | "zone-of-truth"
  | "spike-growth"
  | "wall-of-fire"
  | "cloud-of-daggers"
  | "sleet-storm"
  | "spirit-guardians"
  | "spiritual-weapon"
  | "storm-of-vengeance"
  | "conjure-animals"
  | "conjure-elemental"
  | "guardian-of-faith"
  | "conjure-woodland-beings";

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
  hotSide?: "left" | "right" | null;
}

export type ConditionSlug =
  | "prone"
  | "restrained"
  | "blinded"
  | "truth_bound";

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
  | {
      kind: "on-cast";
      save?: SaveSpec;
      damage?: DamageSpec;
      oncePerTurn?: boolean;
    }
  | {
      kind: "on-enter";
      save?: SaveSpec;
      damage?: DamageSpec;
      oncePerTurn?: boolean;
    }
  | {
      kind: "on-area-moved-into";
      save?: SaveSpec;
      damage?: DamageSpec;
      oncePerTurn?: boolean;
    }
  | {
      kind: "on-restrained-start-turn";
      save: SaveSpec;
      damage: DamageSpec;
    }
  | { kind: "on-move-through"; damagePerCell: DamageSpec }
  | {
      kind: "on-start-turn-in";
      save?: SaveSpec;
      damage?: DamageSpec;
      oncePerTurn?: boolean;
    }
  | {
      kind: "on-end-turn-in";
      save?: SaveSpec;
      damage?: DamageSpec;
      oncePerTurn?: boolean;
    }
  | { kind: "on-end-turn-adjacent"; damage: DamageSpec; range: number }
  | {
      kind: "on-pass-through-wall";
      damage: DamageSpec;
      oncePerTurn?: boolean;
    };

export interface TileEffectTactical {
  tags: string[];

  tacticalValue: number;
  beneficiaryFaction: "caster" | "allies" | "neutral";
  creatureAffinity?: { high?: string[]; low?: string[] };
  relocatedTurnKey?: string;
  targeting?: "all" | "hostile_only";
  casterFaction?: "ally" | "enemy" | "neutral";
  restrainedTargetId?: string | null;
  elementalDamageType?: "cold" | "fire" | "lightning" | "thunder";
  createdRound?: number;
  lastResolvedRound?: number;
  damageBudgetTotal?: number;
  damageDealtTotal?: number;
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
      sourceConcentration: false,
      triggers: [
        { kind: "on-cast", save: { ability: "dex", onFailCondition: "prone" } },
        {
          kind: "on-enter",
          save: { ability: "dex", onFailCondition: "prone" },
        },
        {
          kind: "on-end-turn-in",
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
        {
          kind: "on-start-turn-in",
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

    "zone-of-truth": {
      spellSlug: "zone-of-truth",
      shapeKind: "sphere",
      defaultRadiusCells: () => 3,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: false,
      triggers: [
        {
          kind: "on-enter",
          save: { ability: "cha", onFailCondition: "truth_bound" },
          oncePerTurn: true,
        },
        {
          kind: "on-start-turn-in",
          save: { ability: "cha", onFailCondition: "truth_bound" },
        },
      ],
      tactical: {
        tags: ["social", "control", "truth", "no-concentration"],
        tacticalValue: 4,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Uma esfera translúcida denuncia quem não consegue pronunciar uma mentira deliberada.",
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
          oncePerTurn: true,
        },
        {
          kind: "on-end-turn-adjacent",
          damage: bySlotLinear(4, 5, "fire", 8, 1),
          range: 2,
        },
      ],
      tactical: {
        tags: ["damage", "wall", "area-denial", "fire"],
        tacticalValue: 8,
        beneficiaryFaction: "caster",
        creatureAffinity: { high: ["fire-immune"], low: ["fire-vulnerable"] },
      },
      narrativeDescriptor:
        "Parede opaca: 5d8 ao surgir ou atravessar; no fim do turno, até 3 metros do lado quente escolhido.",
    },


    "cloud-of-daggers": {
      spellSlug: "cloud-of-daggers",
      shapeKind: "cube",
      defaultRadiusCells: () => 1,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-cast",
          damage: bySlotLinear(2, 4, "slashing", 4, 2),
          oncePerTurn: true,
        },
        {
          kind: "on-enter",
          damage: bySlotLinear(2, 4, "slashing", 4, 2),
          oncePerTurn: true,
        },
        {
          kind: "on-end-turn-in",
          damage: bySlotLinear(2, 4, "slashing", 4, 2),
          oncePerTurn: true,
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

    "spiritual-weapon": {
      spellSlug: "spiritual-weapon",
      shapeKind: "sphere",
      // The weapon is a movable point effect, not a creature or an area.
      defaultRadiusCells: () => 0,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: false,
      triggers: [],
      tactical: {
        tags: ["damage", "force", "movable", "bonus-action"],
        tacticalValue: 6,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Uma arma espectral flutua neste espaço; não é criatura e não ocupa a iniciativa.",
    },

    "storm-of-vengeance": {
      spellSlug: "storm-of-vengeance",
      shapeKind: "cylinder",
      defaultRadiusCells: () => 72,
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 10,
      sourceConcentration: true,
      triggers: [],
      tactical: {
        tags: [
          "damage",
          "storm",
          "heavily-obscured",
          "difficult-terrain",
          "ranged-attacks-impossible",
          "multi-round",
        ],
        tacticalValue: 10,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Tempestade colossal: área muito obscurecida e terreno difícil; seus efeitos mudam a cada rodada.",
    },

    "conjure-animals": {
      spellSlug: "conjure-animals",
      shapeKind: "cube",
      // A Large (10-foot) pack plus 10 feet around it occupies a 30-foot
      // influence envelope on the grid.
      defaultRadiusCells: () => 6,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-area-moved-into",
          save: { ability: "dex", halfOnSave: true },
          damage: bySlotLinear(3, 3, "slashing", 10, 1),
          oncePerTurn: true,
        },
        {
          kind: "on-enter",
          save: { ability: "dex", halfOnSave: true },
          damage: bySlotLinear(3, 3, "slashing", 10, 1),
          oncePerTurn: true,
        },
        {
          kind: "on-end-turn-in",
          save: { ability: "dex", halfOnSave: true },
          damage: bySlotLinear(3, 3, "slashing", 10, 1),
          oncePerTurn: true,
        },
      ],
      tactical: {
        tags: ["damage", "spirit", "pack", "movable", "slashing"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
      },
      narrativeDescriptor:
        "Uma matilha Grande de espíritos animais ocupa o centro; criaturas a até 3 metros sofrem seus ataques.",
    },

    "conjure-elemental": {
      spellSlug: "conjure-elemental",
      shapeKind: "cube",
      // A Large (10-foot) spirit plus the 5-foot start-turn perimeter occupies
      // a 20-foot envelope. Entry only triggers in the central 2x2 core.
      defaultRadiusCells: () => 4,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: true,
      triggers: [
        {
          kind: "on-enter",
          save: { ability: "dex", onFailCondition: "restrained" },
          damage: bySlotLinear(5, 8, "elemental", 8, 1),
        },
        {
          kind: "on-start-turn-in",
          save: { ability: "dex", onFailCondition: "restrained" },
          damage: bySlotLinear(5, 8, "elemental", 8, 1),
        },
        {
          kind: "on-restrained-start-turn",
          save: { ability: "dex" },
          damage: bySlotLinear(5, 4, "elemental", 8, 1),
        },
      ],
      tactical: {
        tags: ["damage", "control", "restrained", "spirit", "stationary"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        restrainedTargetId: null,
      },
      narrativeDescriptor:
        "Um espírito elemental Large e intangível ocupa o centro e pode restringir uma criatura.",
    },

    "guardian-of-faith": {
      spellSlug: "guardian-of-faith",
      shapeKind: "cube",
      // A Large (10-foot) guardian plus 10 feet around it occupies a 30-foot
      // influence envelope. The origin is the top-left cell of its 2x2 core.
      defaultRadiusCells: () => 6,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 4800,
      sourceConcentration: false,
      triggers: [
        {
          kind: "on-enter",
          save: { ability: "dex", halfOnSave: true },
          damage: {
            expressionPerSlot: () => "20",
            type: "radiant",
          },
          oncePerTurn: true,
        },
        {
          kind: "on-start-turn-in",
          save: { ability: "dex", halfOnSave: true },
          damage: {
            expressionPerSlot: () => "20",
            type: "radiant",
          },
          oncePerTurn: true,
        },
      ],
      tactical: {
        tags: [
          "damage",
          "guardian",
          "stationary",
          "large",
          "radiant",
          "no-concentration",
        ],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        damageBudgetTotal: 60,
        damageDealtTotal: 0,
      },
      narrativeDescriptor:
        "Um guardião espectral Large protege a área e pune inimigos próximos com dano radiante.",
    },

    "conjure-woodland-beings": {
      spellSlug: "conjure-woodland-beings",
      shapeKind: "sphere",
      defaultRadiusCells: () => 2,
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 100,
      sourceConcentration: true,
      auraFollowsCaster: true,
      triggers: [
        {
          kind: "on-cast",
          save: { ability: "wis", halfOnSave: true },
          damage: bySlotLinear(4, 5, "force", 8, 1),
          oncePerTurn: true,
        },
        {
          kind: "on-enter",
          save: { ability: "wis", halfOnSave: true },
          damage: bySlotLinear(4, 5, "force", 8, 1),
          oncePerTurn: true,
        },
        {
          kind: "on-end-turn-in",
          save: { ability: "wis", halfOnSave: true },
          damage: bySlotLinear(4, 5, "force", 8, 1),
          oncePerTurn: true,
        },
      ],
      tactical: {
        tags: ["damage", "aura", "emanation", "force", "mobility"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
      },
      narrativeDescriptor:
        "Espíritos feéricos giram em uma emanação de 3 metros ao redor do conjurador.",
    },
  };


export function getTileEffectDefinition(
  slug: string,
): TileEffectDefinition | null {
  const normalized = slug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
  return TILE_EFFECT_CATALOG[normalized as TileEffectKind] ?? null;
}
