/**
 * Spec 016 P5/P6 (M4) — XP helpers (pure).
 *
 * RAW 2024 PHB XP thresholds (também em shared/srd-constants).
 * Funções puras: lookup do level pelo total XP, progresso até próximo
 * nível, aplicação de award com levelUpReady flag.
 *
 * `campaign.xp_mode` policy aplicada aqui:
 *   'rules'     — grants raw amount (default RAW)
 *   'milestone' — coerces to 0 unless source=quest_step|quest_completion|exploration_milestone
 *   'hybrid'    — combat raw + roleplay coerced 0 (BG3-ish)
 */

export const XP_THRESHOLDS_2024 = [
  0, // L1
  300, // L2
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000, // L11
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000, // L20
] as const;

const MAX_LEVEL = XP_THRESHOLDS_2024.length;

export type XpAwardSource =
  | "combat_kill"
  | "combat_resolved_peacefully"
  | "skill_challenge"
  | "quest_step"
  | "quest_completion"
  | "exploration_milestone"
  | "roleplay";

export type XpMode = "rules" | "milestone" | "hybrid";

const COMBAT_SOURCES: XpAwardSource[] = [
  "combat_kill",
  "combat_resolved_peacefully",
];

const MILESTONE_SOURCES: XpAwardSource[] = [
  "quest_step",
  "quest_completion",
  "exploration_milestone",
];

/**
 * Aplica policy de xp mode. Returns awardedXp (0 se mode coerce).
 */
export function policyAdjustedAward(
  amount: number,
  source: XpAwardSource,
  mode: XpMode,
): number {
  if (mode === "rules") return amount;
  if (mode === "milestone") {
    return MILESTONE_SOURCES.includes(source) ? amount : 0;
  }
  // hybrid: combat OK + milestone OK; roleplay/skill_challenge coerced
  if (mode === "hybrid") {
    if (COMBAT_SOURCES.includes(source)) return amount;
    if (MILESTONE_SOURCES.includes(source)) return amount;
    return 0;
  }
  return amount;
}

/**
 * Dado XP total, retorna o level (1..20).
 */
export function levelForXp(totalXp: number): number {
  if (totalXp < 0) return 1;
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (totalXp >= XP_THRESHOLDS_2024[lvl - 1]) return lvl;
  }
  return 1;
}

/**
 * Threshold pra atingir o level N. xpThresholdForLevel(2) === 300.
 */
export function xpThresholdForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > MAX_LEVEL) return XP_THRESHOLDS_2024[MAX_LEVEL - 1];
  return XP_THRESHOLDS_2024[level - 1];
}

export interface XpProgress {
  level: number;
  xpInLevel: number;
  xpRequiredForNextLevel: number;
  /** progress 0..1 dentro do nível atual (1.0 quando ready pra subir). */
  progressFraction: number;
  isMaxLevel: boolean;
  /** XP needed pra atingir próximo level (0 se max). */
  xpToNextLevel: number;
}

/**
 * Computa progresso visual dado total XP. Útil pra HUD bar.
 */
export function computeXpProgress(totalXp: number): XpProgress {
  const level = levelForXp(totalXp);
  if (level >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      xpInLevel: totalXp - XP_THRESHOLDS_2024[MAX_LEVEL - 1],
      xpRequiredForNextLevel: 0,
      progressFraction: 1,
      isMaxLevel: true,
      xpToNextLevel: 0,
    };
  }
  const currentThreshold = XP_THRESHOLDS_2024[level - 1];
  const nextThreshold = XP_THRESHOLDS_2024[level];
  const xpInLevel = totalXp - currentThreshold;
  const xpRequiredForNextLevel = nextThreshold - currentThreshold;
  const progressFraction =
    xpRequiredForNextLevel > 0 ? xpInLevel / xpRequiredForNextLevel : 1;
  return {
    level,
    xpInLevel,
    xpRequiredForNextLevel,
    progressFraction,
    isMaxLevel: false,
    xpToNextLevel: nextThreshold - totalXp,
  };
}

export interface XpAwardOutcome {
  awardedXp: number;
  totalXpBefore: number;
  totalXpAfter: number;
  levelBefore: number;
  levelAfter: number;
  levelUpReady: boolean;
  /** Threshold do próximo nível (após award). 0 se max level. */
  nextThreshold: number;
  /** XP faltando pra próximo nível (0 se max). */
  xpToNextLevel: number;
  /** Modo XP aplicado. */
  modeApplied: XpMode;
  /** Fonte do award. */
  source: XpAwardSource;
}

/**
 * Aplica um XP award puro: respeita policy, computa novo total,
 * detecta level-up ready.
 *
 * NÃO muta state — caller persiste se ok.
 */
export function applyXpAward(input: {
  totalXpBefore: number;
  amount: number;
  source: XpAwardSource;
  mode?: XpMode;
}): XpAwardOutcome {
  const mode = input.mode ?? "rules";
  const adjustedAmount = policyAdjustedAward(input.amount, input.source, mode);
  const totalXpAfter = Math.max(0, input.totalXpBefore + adjustedAmount);
  const levelBefore = levelForXp(input.totalXpBefore);
  const levelAfter = levelForXp(totalXpAfter);
  const isMax = levelAfter >= MAX_LEVEL;
  const nextThreshold = isMax ? 0 : XP_THRESHOLDS_2024[levelAfter];
  const xpToNextLevel = isMax ? 0 : Math.max(0, nextThreshold - totalXpAfter);
  return {
    awardedXp: adjustedAmount,
    totalXpBefore: input.totalXpBefore,
    totalXpAfter,
    levelBefore,
    levelAfter,
    levelUpReady: levelAfter > levelBefore || (xpToNextLevel === 0 && !isMax),
    nextThreshold,
    xpToNextLevel,
    modeApplied: mode,
    source: input.source,
  };
}
