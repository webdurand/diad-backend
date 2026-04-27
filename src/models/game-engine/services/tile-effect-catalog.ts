import type { SaveAbility } from "../interfaces/combat.interfaces";

/**
 * Spec 013 — Tile Effect Catalog.
 *
 * Catálogo OCP-aligned de magias que criam tile-effects persistentes.
 * Adicionar magia nova = nova entry aqui; ZERO edit em service.
 *
 * Princípio X (Constitution): cada entry expõe três camadas:
 *   1. Mecânica RAW    — `triggers[]`, `shapeKind`, `defaultRadiusCells`
 *   2. Metadata tática — `tactical` (tags, tacticalValue, beneficiaryFaction)
 *   3. Narrativa       — `narrativeDescriptor` (≤120 chars PT-BR)
 *
 * Referências RAW 2024 — PHB pp.273 (Grease), 329 (Spike Growth), 353 (Wall of Fire);
 * dnd2024.wikidot/dndbeyond/roll20 2024 compendiums.
 */

export type TileEffectKind =
  | "grease"
  | "web"
  | "spike-growth"
  | "wall-of-fire"
  | "cloud-of-daggers"
  | "sleet-storm"
  | "spirit-guardians";

export type ConditionSlug = "prone" | "restrained" | "blinded";

export interface SaveSpec {
  ability: SaveAbility;
  /** Half damage if save passes (Wall of Fire, Spirit Guardians). */
  halfOnSave?: boolean;
  /** Condition aplicada quando save falha (Grease=prone, Web=restrained). */
  onFailCondition?: ConditionSlug;
  /** RAW 2024 Sleet Storm: save falhar quebra concentração + aplica prone (fused). */
  affectsConcentration?: boolean;
}

export interface DamageSpec {
  /** Função de slot → expression (ex: slot=4 → '5d8'). */
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
  /** 0 = irrelevante; 10 = decisivo. */
  tacticalValue: number;
  beneficiaryFaction: "caster" | "allies" | "neutral";
  creatureAffinity?: { high?: string[]; low?: string[] };
}

export interface TileEffectDefinition {
  spellSlug: string;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
  /** Slot → raio em cells. Ex: Grease 10ft cube → 2 cells. */
  defaultRadiusCells: (slot: number) => number;
  isDifficultTerrain: boolean;
  /** Multiplicador de speed: 0.5=×2 cost; 0=stop on fail save (Web). null=default 0.5. */
  speedMultiplier?: number;
  /** Slot → rounds. null = sem prazo. */
  durationRoundsAtSlot: (slot: number) => number | null;
  sourceConcentration: boolean;
  triggers: TileEffectTrigger[];
  tactical: TileEffectTactical;
  /** Princípio X camada 3 — prosa curta PT-BR (≤120 chars) usada pelo Narrator agent. */
  narrativeDescriptor: string;
  /** Spec 004 legacy — Spirit Guardians segue o caster. */
  auraFollowsCaster?: boolean;
}

// ── Helpers de damage scaling ─────────────────────────────────────────────

/** xdY com base em slot mínimo + dado extra por slot acima. */
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

/** Damage fixo (Spike Growth: 2d4 piercing constante). */
function fixedDamage(dice: number, diceSize: number, type: string): DamageSpec {
  return {
    expressionPerSlot: () => `${dice}d${diceSize}`,
    type,
  };
}

// ── Catálogo ──────────────────────────────────────────────────────────────

export const TILE_EFFECT_CATALOG: Record<TileEffectKind, TileEffectDefinition> =
  {
    // L1 Wizard — DEX save → Prone; difficult terrain; 1 min concentration.
    grease: {
      spellSlug: "grease",
      shapeKind: "cube",
      defaultRadiusCells: () => 2, // 10ft = 2 cells (cube radius)
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 10, // 1 min = 10 rounds
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

    // L2 Wizard — DEX save → Restrained; STR check to escape; 1 hour concentration.
    web: {
      spellSlug: "web",
      shapeKind: "cube",
      defaultRadiusCells: () => 4, // 20ft cube = 4 cells radius
      isDifficultTerrain: true,
      speedMultiplier: 0, // RAW: end movement on enter when save fails
      durationRoundsAtSlot: () => 600, // 1 hour = 600 rounds (effectively combat-long)
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

    // L2 Druid/Ranger — 2d4 piercing per 5ft moved; difficult terrain; 10min concentration.
    // RAW: NO save — damage is automatic per cell of movement.
    "spike-growth": {
      spellSlug: "spike-growth",
      shapeKind: "sphere",
      defaultRadiusCells: () => 4, // 20ft radius = 4 cells
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 100, // 10 min concentration = 100 rounds
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

    // L4 Wizard/Druid — 5d8 fire on cast (DEX half) + on-pass-through-wall + on-end-turn-adjacent.
    // 2024: cold side disabled by default (caster picks heat side).
    "wall-of-fire": {
      spellSlug: "wall-of-fire",
      shapeKind: "line",
      defaultRadiusCells: () => 12, // 60ft line = 12 cells
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10, // 1 min concentration = 10 rounds
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

    // L2 — 4d4 slashing on cast (NEW 2024) + on-enter + on-start-turn-in. NO save.
    "cloud-of-daggers": {
      spellSlug: "cloud-of-daggers",
      shapeKind: "cube",
      defaultRadiusCells: () => 1, // 5ft cube = 1 cell
      isDifficultTerrain: false,
      durationRoundsAtSlot: () => 10, // 1 min concentration = 10 rounds
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

    // L3 — DEX save → Prone + concentration check FUSED (2024 buff).
    // 20ft radius × 40ft tall cylinder; heavily obscured + Blinded inside.
    "sleet-storm": {
      spellSlug: "sleet-storm",
      shapeKind: "cylinder",
      defaultRadiusCells: () => 4, // 20ft radius = 4 cells
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 10, // 1 min concentration = 10 rounds
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

    // L3 Cleric — 15ft aura that follows caster; WIS save half; 3d8 radiant per turn.
    // Refator: deixa de ser hardcoded (Spec 004 legacy) e entra no catalog OCP-aligned.
    "spirit-guardians": {
      spellSlug: "spirit-guardians",
      shapeKind: "sphere",
      defaultRadiusCells: () => 3, // 15ft = 3 cells
      isDifficultTerrain: true,
      speedMultiplier: 0.5,
      durationRoundsAtSlot: () => 100, // 10 min concentration = 100 rounds
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

/**
 * Helper para lookup case-sensitive. Retorna null pra slug inexistente
 * pra não esconder bug de typo (vs. retornar undefined).
 */
export function getTileEffectDefinition(
  slug: string,
): TileEffectDefinition | null {
  return TILE_EFFECT_CATALOG[slug as TileEffectKind] ?? null;
}
