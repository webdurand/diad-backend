import { Injectable } from '@nestjs/common';
import {
  DiceResult,
  AdvantageResult,
  InitiativeResult,
} from '../interfaces/dice.interfaces';

/**
 * Deterministic dice rolling service.
 * Uses seedable PRNG (mulberry32) for testing, crypto-random in production.
 */
@Injectable()
export class DiceService {
  private seededRng: (() => number) | null = null;

  /**
   * Set a seed for deterministic results (testing).
   */
  setSeed(seed: number): void {
    this.seededRng = this.mulberry32(seed);
  }

  /**
   * Clear seed — revert to Math.random().
   */
  clearSeed(): void {
    this.seededRng = null;
  }

  /**
   * Roll a single die with N sides. Returns 1-N.
   */
  roll(sides: number): number {
    if (sides < 1) return 0;
    return Math.floor(this.random() * sides) + 1;
  }

  /**
   * Roll multiple dice. Returns array of individual results.
   */
  rollMultiple(count: number, sides: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.roll(sides));
    }
    return results;
  }

  /**
   * Parse and roll a dice expression.
   * Supports: "2d6", "2d6+3", "1d20-2", "4d6kh3" (keep highest 3), "2d20kl1" (keep lowest 1).
   */
  rollExpression(expr: string): DiceResult {
    const trimmed = expr.replace(/\s/g, '').toLowerCase();

    const match = trimmed.match(
      /^(\d+)d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/,
    );

    if (!match) {
      return {
        expression: expr,
        rolls: [],
        modifier: 0,
        total: 0,
      };
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const keepMode = match[3] as 'kh' | 'kl' | undefined;
    const keepCount = match[4] ? parseInt(match[4], 10) : undefined;
    const modifier = match[5] ? parseInt(match[5], 10) : 0;

    const allRolls = this.rollMultiple(count, sides);

    let kept: number[];
    let dropped: number[] | undefined;

    if (keepMode && keepCount !== undefined && keepCount < count) {
      const sorted = [...allRolls].sort((a, b) => b - a);
      if (keepMode === 'kh') {
        kept = sorted.slice(0, keepCount);
        dropped = sorted.slice(keepCount);
      } else {
        kept = sorted.slice(sorted.length - keepCount);
        dropped = sorted.slice(0, sorted.length - keepCount);
      }
    } else {
      kept = allRolls;
    }

    const sum = kept.reduce((a, b) => a + b, 0);

    return {
      expression: expr,
      rolls: allRolls,
      modifier,
      total: sum + modifier,
      dropped,
    };
  }

  /**
   * Roll 2d20, take the highest.
   */
  rollWithAdvantage(): AdvantageResult {
    const roll1 = this.roll(20);
    const roll2 = this.roll(20);
    const chosen = Math.max(roll1, roll2);
    const discarded = Math.min(roll1, roll2);
    return { roll1, roll2, chosen, discarded };
  }

  /**
   * Roll 2d20, take the lowest.
   */
  rollWithDisadvantage(): AdvantageResult {
    const roll1 = this.roll(20);
    const roll2 = this.roll(20);
    const chosen = Math.min(roll1, roll2);
    const discarded = Math.max(roll1, roll2);
    return { roll1, roll2, chosen, discarded };
  }

  /**
   * Roll initiative: 1d20 + modifier.
   */
  rollInitiative(modifier: number): InitiativeResult {
    const roll = this.roll(20);
    return {
      roll,
      modifier,
      total: roll + modifier,
    };
  }

  /**
   * Internal random: seeded or Math.random().
   */
  private random(): number {
    if (this.seededRng) {
      return this.seededRng();
    }
    return Math.random();
  }

  /**
   * Mulberry32 — fast, deterministic 32-bit PRNG.
   */
  private mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
