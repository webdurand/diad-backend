/**
 * Spec 016 P4 (M3) — Fate Ladder pure helpers.
 *
 * Stateless logic isolada: price table seleção, sacrifice validation,
 * resurrection requirements per spell. Service `fate-ladder.service.ts`
 * envelopa estes helpers + DB lookups (inventory, party).
 */

export type ResurrectionSpell =
  | "Revivify"
  | "Raise Dead"
  | "Resurrection"
  | "True Resurrection";

export interface ResurrectionRequirements {
  spell: ResurrectionSpell;
  diamondGp: number;
  spellSlotLevel: number;
  /** Janela em minutos (após morte) em que o spell pode ser cast. */
  timeWindowMinutes: number;
  d20Penalty: number;
  decayPerLongRest: number;
  duration:
    | "none"
    | "until_long_rest_decay"
    | "permanent_until_greater_restoration";
}

export const RESURRECTION_TABLE: Record<
  ResurrectionSpell,
  ResurrectionRequirements
> = {
  // RAW 2024 PHB.
  Revivify: {
    spell: "Revivify",
    diamondGp: 300,
    spellSlotLevel: 3,
    timeWindowMinutes: 1,
    d20Penalty: 0,
    decayPerLongRest: 0,
    duration: "none",
  },
  "Raise Dead": {
    spell: "Raise Dead",
    diamondGp: 500,
    spellSlotLevel: 5,
    timeWindowMinutes: 10 * 24 * 60, // 10 dias
    d20Penalty: -4,
    decayPerLongRest: 1,
    duration: "until_long_rest_decay",
  },
  Resurrection: {
    spell: "Resurrection",
    diamondGp: 1000,
    spellSlotLevel: 7,
    timeWindowMinutes: 100 * 365 * 24 * 60, // 100 anos
    d20Penalty: -4,
    decayPerLongRest: 1,
    duration: "until_long_rest_decay",
  },
  "True Resurrection": {
    spell: "True Resurrection",
    diamondGp: 25000,
    spellSlotLevel: 9,
    timeWindowMinutes: 200 * 365 * 24 * 60, // 200 anos
    d20Penalty: 0,
    decayPerLongRest: 0,
    duration: "none",
  },
};

export type PriceCostKind =
  | "npc_bond_broken"
  | "faction_shift_hostile"
  | "exhaustion_plus_2_perm"
  | "quest_hard_locked"
  | "magic_item_consumed"
  | "memory_loss_one_scene";

export interface PriceCost {
  kind: PriceCostKind;
  narrativeFraming: string;
  weight: number;
}

/**
 * Default price table (M3 ships). M4 expandirá via PriceTable seed migration.
 * Forbidden (NUNCA inclusos): level_drain, hp_max_permanent_loss,
 * ability_score_reduction (Ironsworn lesson + community consensus).
 */
export const DEFAULT_PRICE_TABLE: PriceCost[] = [
  {
    kind: "npc_bond_broken",
    narrativeFraming:
      "Um NPC aliado se afasta — culpa, dor ou trauma quebra o vínculo.",
    weight: 25,
  },
  {
    kind: "faction_shift_hostile",
    narrativeFraming:
      "Uma facção que era neutra agora é hostil — o resgate teve um preço político.",
    weight: 15,
  },
  {
    kind: "exhaustion_plus_2_perm",
    narrativeFraming:
      "O corpo sobrevive marcado: 2 níveis de exaustão permanentes (até greater restoration).",
    weight: 20,
  },
  {
    kind: "quest_hard_locked",
    narrativeFraming:
      "Uma quest secundária se fecha — quem você precisava ajudar morre ou desaparece.",
    weight: 15,
  },
  {
    kind: "magic_item_consumed",
    narrativeFraming:
      "Um item mágico significativo se quebra ou consome a si mesmo no preço.",
    weight: 15,
  },
  {
    kind: "memory_loss_one_scene",
    narrativeFraming:
      "Você esquece o que aconteceu na cena anterior — ela vira mistério no journal.",
    weight: 10,
  },
];

export const FORBIDDEN_COSTS = [
  "level_drain",
  "hp_max_permanent_loss",
  "ability_score_reduction",
] as const;

/**
 * Seleciona um price weighted-random. RNG injetada (default Math.random)
 * pra testabilidade.
 */
export function pickRandomPrice(
  table: PriceCost[] = DEFAULT_PRICE_TABLE,
  rng: () => number = Math.random,
): PriceCost {
  const totalWeight = table.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * totalWeight;
  for (const cost of table) {
    if (r < cost.weight) return cost;
    r -= cost.weight;
  }
  return table[table.length - 1];
}

/**
 * Valida sacrifício heroico (option B). Bounded: deve referenciar cena
 * atual, não pode resolver arcs ungated, max 1 objetivo resolvido.
 *
 * Heurística textual; M5 adiciona validação semântica via Director LLM.
 */
export interface SacrificeValidation {
  ok: boolean;
  reason?: string;
}

export function validateSacrificeBounded(
  text: string,
  options?: {
    minLength?: number;
    maxLength?: number;
  },
): SacrificeValidation {
  const trimmed = text.trim();
  const min = options?.minLength ?? 10;
  const max = options?.maxLength ?? 300;

  if (trimmed.length < min) {
    return { ok: false, reason: "Descrição muito curta. Use 1-2 frases." };
  }
  if (trimmed.length > max) {
    return { ok: false, reason: "Descrição muito longa. Limite: 1-2 frases." };
  }
  // Heurística anti-grand-claim: rejeita verbos que sugerem resolver arcs ungated.
  const overreachPatterns = [
    /salv[oa]\s+(o\s+)?(mundo|reino|continente|multiverso)/i,
    /derrot[oa]\s+(o\s+|a\s+)?(deus|deusa)/i,
    /resolv[oa]\s+toda\s+a\s+campanha/i,
    /destru[oa]\s+todos?\s+os\s+(inimigos|orcs|dragões)/i,
  ];
  for (const pattern of overreachPatterns) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason:
          "Sacrifício deve fechar a cena atual, não resolver arcs futuros.",
      };
    }
  }
  return { ok: true };
}

/**
 * Dado tempo desde morte (minutos) e diamantes disponíveis (gp), retorna
 * quais resurrection spells podem ser oferecidos. Não checa caster — isso
 * é responsabilidade do service que tem acesso a inventory + party.
 */
export function eligibleResurrectionSpells(input: {
  minutesSinceDeath: number;
  diamondsAvailableGp: number;
}): ResurrectionSpell[] {
  return Object.values(RESURRECTION_TABLE)
    .filter(
      (req) =>
        input.minutesSinceDeath <= req.timeWindowMinutes &&
        input.diamondsAvailableGp >= req.diamondGp,
    )
    .map((req) => req.spell);
}

/**
 * Outcome do option C (Pay the Price): HP=1, status=stable_unconscious,
 * acorda no próximo round.
 */
export interface PayPriceOutcome {
  hpRestored: 1;
  status: "stable_unconscious";
  wakesNextRound: true;
  costApplied: PriceCost;
}

export function buildPayPriceOutcome(cost: PriceCost): PayPriceOutcome {
  return {
    hpRestored: 1,
    status: "stable_unconscious",
    wakesNextRound: true,
    costApplied: cost,
  };
}
