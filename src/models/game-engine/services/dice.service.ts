import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import {
  AdvantageResult,
  DiceModifierBreakdown,
  DiceResult,
  DiceRollAdvantage,
  DiceRollKind,
  DiceRollRequest,
  DiceRollResolved,
  DiceVerdict,
  InitiativeResult,
} from "../interfaces/dice.interfaces";


@Injectable()
export class DiceService {
  private seededRng: (() => number) | null = null;


  setSeed(seed: number): void {
    this.seededRng = this.mulberry32(seed);
  }


  clearSeed(): void {
    this.seededRng = null;
  }


  roll(sides: number): number {
    if (sides < 1) return 0;
    return Math.floor(this.random() * sides) + 1;
  }


  rollMultiple(count: number, sides: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.roll(sides));
    }
    return results;
  }


  rollExpression(expr: string): DiceResult {
    const trimmed = expr.replace(/\s/g, "").toLowerCase();


    if (/^\d+$/.test(trimmed)) {
      const value = parseInt(trimmed, 10);
      return {
        expression: expr,
        rolls: [],
        modifier: value,
        total: value,
      };
    }

    const match = trimmed.match(/^(\d+)d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/);

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
    const keepMode = match[3] as "kh" | "kl" | undefined;
    const keepCount = match[4] ? parseInt(match[4], 10) : undefined;
    const modifier = match[5] ? parseInt(match[5], 10) : 0;

    const allRolls = this.rollMultiple(count, sides);

    let kept: number[];
    let dropped: number[] | undefined;

    if (keepMode && keepCount !== undefined && keepCount < count) {
      const sorted = [...allRolls].sort((a, b) => b - a);
      if (keepMode === "kh") {
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


  rollWithAdvantage(): AdvantageResult {
    const roll1 = this.roll(20);
    const roll2 = this.roll(20);
    const chosen = Math.max(roll1, roll2);
    const discarded = Math.min(roll1, roll2);
    return { roll1, roll2, chosen, discarded };
  }


  rollWithDisadvantage(): AdvantageResult {
    const roll1 = this.roll(20);
    const roll2 = this.roll(20);
    const chosen = Math.min(roll1, roll2);
    const discarded = Math.max(roll1, roll2);
    return { roll1, roll2, chosen, discarded };
  }


  rollInitiative(
    modifier: number,
    options?: { advantage?: boolean },
  ): InitiativeResult {
    let roll = this.roll(20);

    if (options?.advantage) {
      const second = this.roll(20);
      if (second > roll) roll = second;
    }
    return {
      roll,
      modifier,
      total: roll + modifier,
    };
  }


  buildDiceRollRequest(input: {
    kind: DiceRollKind;
    ability: DiceRollRequest["ability"];
    skill?: string | null;
    dc: number;
    modifiers: DiceModifierBreakdown[];
    advantage?: DiceRollAdvantage;
    characterId?: string;
    narrativeFraming?: string;
    rollId?: string;
  }): DiceRollRequest {
    const totalModifier = input.modifiers.reduce((sum, m) => sum + m.value, 0);
    const rawTarget = input.dc - totalModifier;
    const targetD20 = Math.max(2, Math.min(30, rawTarget));
    return {
      rollId: input.rollId ?? randomUUID(),
      characterId: input.characterId,
      kind: input.kind,
      ability: input.ability,
      skill: input.skill ?? null,
      dc: input.dc,
      advantage: input.advantage ?? "normal",
      modifiers: input.modifiers,
      totalModifier,
      targetD20,
      narrativeFraming: input.narrativeFraming,
    };
  }


  resolveDiceRoll(input: {
    rollId: string;
    rawD20: number;
    rawD20Disadv?: number | null;
    totalModifier: number;
    dc: number;
    kind: DiceRollKind;
  }): DiceRollResolved {
    const total = input.rawD20 + input.totalModifier;
    const isNat20 = input.rawD20 === 20;
    const isNat1 = input.rawD20 === 1;
    const passes = total >= input.dc;

    let verdict: DiceVerdict;
    if (isNat20 && passes) {
      verdict = "crit_success";
    } else if (isNat1 && !passes) {
      verdict = "crit_failure";
    } else if (input.kind === "attack_roll" && isNat20) {
      verdict = "crit_success";
    } else if (input.kind === "attack_roll" && isNat1) {
      verdict = "crit_failure";
    } else if (passes) {
      verdict = "success";
    } else {
      verdict = "failure";
    }

    return {
      rollId: input.rollId,
      rawD20: input.rawD20,
      rawD20Disadv: input.rawD20Disadv ?? null,
      total,
      verdict,
    };
  }


  private random(): number {
    if (this.seededRng) {
      return this.seededRng();
    }
    return Math.random();
  }


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
