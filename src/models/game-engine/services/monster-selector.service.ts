import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MonsterEntity } from "src/entities/monster.entity";

export type Tier = "1" | "2" | "3" | "4";
export type Difficulty = "low" | "moderate" | "high";
export type LocationType = "wilderness" | "dungeon" | "dungeon_room";
export type CompositionMode = "pack" | "mixed" | "solo";

export interface SelectCompositionInput {
  partyAvgLevel: number;
  partySize: number;
  biomeTags?: string[];
  locationType: LocationType;
  targetDifficulty: Difficulty;
  recentAnchors?: string[];
  creatureTypeHint?: string | null;
  narrativeTags?: string[];
}

export interface MonsterComposition {
  monsterSlugs: string[];
  displayNames: string[];
  anchor: string;
  mode: CompositionMode;
  adjustedXp: number;
  reasonChain: string[];
}

const ENCOUNTER_BUDGET_PER_CHARACTER: Record<
  number,
  Record<Difficulty, number>
> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 },
};

const CR_CAP_PER_TIER: Record<Tier, number> = {
  "1": 4,
  "2": 10,
  "3": 16,
  "4": Number.POSITIVE_INFINITY,
};

const TYPE_BLACKLIST_PER_LOCATION: Record<LocationType, string[]> = {
  wilderness: ["aberration", "construct"],
  dungeon: ["celestial"],
  dungeon_room: ["celestial"],
};

const COUNT_MULTIPLIERS: Array<{ max: number; mult: number }> = [
  { max: 1, mult: 1.0 },
  { max: 2, mult: 1.5 },
  { max: 6, mult: 2.0 },
  { max: 10, mult: 2.5 },
  { max: 14, mult: 3.0 },
  { max: 999, mult: 4.0 },
];

const MAX_MONSTERS = 8;
const ANCHOR_XP_CAP_RATIO = 1.5;
const PACK_SOFT_LOWER = 0.5;
const PACK_SOFT_UPPER = 2.0;
const SOLO_LOWER = 0.7;
const SOLO_UPPER = 2.5;

function deriveTier(level: number): Tier {
  if (level <= 4) return "1";
  if (level <= 10) return "2";
  if (level <= 16) return "3";
  return "4";
}

function multiplier(count: number): number {
  for (const { max, mult } of COUNT_MULTIPLIERS) {
    if (count <= max) return mult;
  }
  return 4.0;
}

function getEnvironment(monster: MonsterEntity): string[] {
  const raw = monster.raw as { environment?: string[] } | undefined;
  return raw?.environment ?? [];
}

function getNarrativeTags(monster: MonsterEntity): string[] {
  const raw = monster.raw as { tags?: string[] } | undefined;
  return [...(raw?.tags ?? []), ...getEnvironment(monster)].map((t) =>
    t.toLowerCase(),
  );
}

function isLegendaryUnique(monster: MonsterEntity): boolean {
  const raw = monster.raw as
    | { legendary?: boolean; unique?: boolean; isUnique?: boolean }
    | undefined;
  return Boolean(raw?.legendary || raw?.unique || raw?.isUnique);
}

@Injectable()
export class MonsterSelectorService {
  rng: () => number = Math.random;

  constructor(
    @InjectRepository(MonsterEntity)
    private readonly repo: Repository<MonsterEntity>,
  ) {}

  async selectComposition(
    input: SelectCompositionInput,
  ): Promise<MonsterComposition | null> {
    const tier = deriveTier(input.partyAvgLevel);
    const crCap = CR_CAP_PER_TIER[tier];
    const baseBlacklist = TYPE_BLACKLIST_PER_LOCATION[input.locationType] ?? [];
    const hint = input.creatureTypeHint?.toLowerCase() || null;
    const narrativeTags = (input.narrativeTags ?? []).map((t) =>
      t.toLowerCase(),
    );
    const blacklistedTypes = hint
      ? baseBlacklist.filter((t) => t !== hint)
      : baseBlacklist;
    const recentAnchors = input.recentAnchors ?? [];
    const budget =
      (ENCOUNTER_BUDGET_PER_CHARACTER[
        Math.max(1, Math.min(20, input.partyAvgLevel))
      ][input.targetDifficulty] ?? 0) * Math.max(1, input.partySize);

    const all = await this.repo.find();

    const baseEligible = all.filter(
      (m) =>
        m.challenge_rating <= crCap &&
        !blacklistedTypes.includes(m.type) &&
        !isLegendaryUnique(m) &&
        !recentAnchors.includes(m.slug),
    );

    let pool = baseEligible;
    let biomeRelaxed = false;
    if (input.biomeTags && input.biomeTags.length > 0) {
      const matched = baseEligible.filter((m) => {
        const envs = getEnvironment(m);
        if (envs.length === 0) return true;
        return envs.some((e) => input.biomeTags!.includes(e));
      });
      if (matched.length > 0) {
        pool = matched;
      } else {
        biomeRelaxed = true;
      }
    }

    let typeHintRelaxed = false;
    if (hint) {
      const byType = pool.filter((m) => m.type.toLowerCase() === hint);
      if (byType.length > 0) {
        pool = byType;
      } else {
        typeHintRelaxed = true;
      }
    }

    let narrativeTagsRelaxed = false;
    if (narrativeTags.length > 0 && pool.length > 0) {
      const byTags = pool.filter((m) => {
        const monsterTags = getNarrativeTags(m);
        if (monsterTags.length === 0) return true;
        return narrativeTags.some((t) => monsterTags.includes(t));
      });
      if (byTags.length > 0) {
        pool = byTags;
      } else {
        narrativeTagsRelaxed = true;
      }
    }

    if (pool.length === 0) return null;

    const anchorPool = pool.filter((m) => m.xp <= budget * ANCHOR_XP_CAP_RATIO);
    const anchor =
      anchorPool.length > 0
        ? this.pickAnchor(anchorPool)
        : this.pickSmallestXp(pool);

    const family = pool.filter(
      (m) =>
        m.type === anchor.type &&
        Math.abs(m.challenge_rating - anchor.challenge_rating) <= 1 &&
        m.slug !== anchor.slug,
    );

    const modeRoll = this.rng();
    let mode: CompositionMode;
    if (modeRoll < 0.8) mode = "pack";
    else if (modeRoll < 0.95) mode = "mixed";
    else mode = "solo";

    let result: {
      slugs: string[];
      mode: CompositionMode;
      adjustedXp: number;
    } | null;
    if (mode === "solo") {
      result = this.composeSolo(pool, budget);
    } else if (mode === "mixed" && family.length > 0) {
      result = this.composeMixed(anchor, family, budget);
    } else {
      result = this.composePack(anchor, budget);
    }

    let compositionRelaxed = false;
    if (!result) {
      result =
        this.composeSolo(pool, budget) ??
        this.composePack(anchor, budget) ??
        this.composeBestEffort(pool, budget);
      compositionRelaxed = !!result;
      if (!result) return null;
    }

    const slugs = result.slugs;
    const displayNames = slugs.map(
      (s) => pool.find((p) => p.slug === s)?.name ?? s,
    );

    const poolSuffix = [
      biomeRelaxed ? "biome relaxed" : null,
      typeHintRelaxed ? "type hint relaxed" : null,
      narrativeTagsRelaxed ? "narrative tags relaxed" : null,
      hint && !typeHintRelaxed ? `type=${hint}` : null,
      narrativeTags.length > 0 && !narrativeTagsRelaxed
        ? `tags=[${narrativeTags.join(",")}]`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
    const reasonChain = [
      `pool=${pool.length}${poolSuffix ? ` (${poolSuffix})` : ""}`,
      `tier=${tier}`,
      `budget=${budget}`,
      `anchor=${anchor.slug}`,
      `mode=${result.mode}`,
      `count=${slugs.length}`,
      `adjusted_xp=${result.adjustedXp}`,
      ...(compositionRelaxed ? ["composition_relaxed=true"] : []),
    ];

    return {
      monsterSlugs: slugs,
      displayNames,
      anchor: anchor.slug,
      mode: result.mode,
      adjustedXp: result.adjustedXp,
      reasonChain,
    };
  }

  private pickAnchor(pool: MonsterEntity[]): MonsterEntity {
    return pool[Math.floor(this.rng() * pool.length)];
  }

  private pickSmallestXp(pool: MonsterEntity[]): MonsterEntity {
    return pool.reduce((min, m) => (m.xp < min.xp ? m : min), pool[0]);
  }

  private composePack(
    anchor: MonsterEntity,
    budget: number,
  ): { slugs: string[]; mode: CompositionMode; adjustedXp: number } | null {
    if (anchor.xp <= 0) return null;
    let bestCount = 0;
    let bestDiff = Infinity;
    const lower = budget * PACK_SOFT_LOWER;
    const upper = budget * PACK_SOFT_UPPER;
    for (let count = 1; count <= MAX_MONSTERS; count++) {
      const adjusted = anchor.xp * count * multiplier(count);
      const diff = Math.abs(adjusted - budget);
      const withinSoft = adjusted >= lower && adjusted <= upper;
      if (withinSoft && diff < bestDiff) {
        bestDiff = diff;
        bestCount = count;
      }
    }
    if (bestCount === 0) return null;
    const adjustedXp = Math.floor(
      anchor.xp * bestCount * multiplier(bestCount),
    );
    return {
      slugs: Array(bestCount).fill(anchor.slug),
      mode: "pack",
      adjustedXp,
    };
  }

  private composeMixed(
    anchor: MonsterEntity,
    family: MonsterEntity[],
    budget: number,
  ): { slugs: string[]; mode: CompositionMode; adjustedXp: number } | null {
    const leaderCandidates = family.filter(
      (f) => f.challenge_rating > anchor.challenge_rating,
    );
    const leader =
      leaderCandidates.length > 0
        ? leaderCandidates[Math.floor(this.rng() * leaderCandidates.length)]
        : family[Math.floor(this.rng() * family.length)];

    let bestSlugs: string[] = [];
    let bestAdjusted = 0;
    let bestDiff = Infinity;
    const lower = budget * PACK_SOFT_LOWER;
    const upper = budget * PACK_SOFT_UPPER;
    for (let anchorCount = 1; anchorCount < MAX_MONSTERS; anchorCount++) {
      const totalCount = anchorCount + 1;
      const rawXp = anchor.xp * anchorCount + leader.xp;
      const adjusted = rawXp * multiplier(totalCount);
      const diff = Math.abs(adjusted - budget);
      const withinSoft = adjusted >= lower && adjusted <= upper;
      if (withinSoft && diff < bestDiff) {
        bestDiff = diff;
        bestSlugs = [...Array(anchorCount).fill(anchor.slug), leader.slug];
        bestAdjusted = adjusted;
      }
    }
    if (bestSlugs.length === 0) return null;
    return {
      slugs: bestSlugs,
      mode: "mixed",
      adjustedXp: Math.floor(bestAdjusted),
    };
  }

  private composeSolo(
    pool: MonsterEntity[],
    budget: number,
  ): { slugs: string[]; mode: CompositionMode; adjustedXp: number } | null {
    const candidates = pool.filter(
      (m) => m.xp >= budget * SOLO_LOWER && m.xp <= budget * SOLO_UPPER,
    );
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(this.rng() * candidates.length)];
    return {
      slugs: [pick.slug],
      mode: "solo",
      adjustedXp: pick.xp,
    };
  }

  private composeBestEffort(
    pool: MonsterEntity[],
    budget: number,
  ): { slugs: string[]; mode: CompositionMode; adjustedXp: number } | null {
    let best:
      | {
          monster: MonsterEntity;
          count: number;
          adjustedXp: number;
          difference: number;
        }
      | undefined;
    for (const monster of pool) {
      if (monster.xp <= 0) continue;
      for (let count = 1; count <= MAX_MONSTERS; count++) {
        const adjustedXp = Math.floor(
          monster.xp * count * multiplier(count),
        );
        const difference = Math.abs(adjustedXp - budget);
        if (!best || difference < best.difference) {
          best = { monster, count, adjustedXp, difference };
        }
      }
    }
    if (!best) return null;
    return {
      slugs: Array(best.count).fill(best.monster.slug),
      mode: best.count === 1 ? "solo" : "pack",
      adjustedXp: best.adjustedXp,
    };
  }
}
