import { randomUUID } from "crypto";

import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  recordDiceRollTrace,
  withoutNestedDiceRollTrace,
} from "src/common/dice/dice-roll-trace.context";
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

  constructor(@Optional() private readonly cls?: ClsService) {}

  setSeed(seed: number): void {
    this.seededRng = this.mulberry32(seed);
  }


  clearSeed(): void {
    this.seededRng = null;
  }


  roll(sides: number): number {
    if (sides < 1) return 0;
    const result = Math.floor(this.random() * sides) + 1;
    if (sides > 1) {
      recordDiceRollTrace(this.cls, {
        expression: `1d${sides}`,
        rolls: [result],
        modifier: 0,
        total: result,
      });
    }
    return result;
  }


  rollMultiple(count: number, sides: number): number[] {
    const results = withoutNestedDiceRollTrace(this.cls, () => {
      const values: number[] = [];
      for (let i = 0; i < count; i++) {
        values.push(this.roll(sides));
      }
      return values;
    });
    if (results.length > 0 && sides > 1) {
      recordDiceRollTrace(this.cls, {
        expression: `${count}d${sides}`,
        rolls: results,
        modifier: 0,
        total: results.reduce((sum, value) => sum + value, 0),
      });
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

    const allRolls = withoutNestedDiceRollTrace(this.cls, () =>
      this.rollMultiple(count, sides),
    );

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

    const result = {
      expression: expr,
      rolls: allRolls,
      modifier,
      total: sum + modifier,
      dropped,
    };
    if (sides > 1) {
      recordDiceRollTrace(this.cls, {
        expression: expr,
        rolls: allRolls,
        modifier,
        total: result.total,
        dropped,
      });
    }
    return result;
  }


  rollWithAdvantage(): AdvantageResult {
    const [roll1, roll2] = withoutNestedDiceRollTrace(this.cls, () => [
      this.roll(20),
      this.roll(20),
    ]);
    const chosen = Math.max(roll1, roll2);
    const discarded = Math.min(roll1, roll2);
    recordDiceRollTrace(this.cls, {
      expression: "2d20kh1",
      rolls: [roll1, roll2],
      modifier: 0,
      total: chosen,
      dropped: [discarded],
    });
    return { roll1, roll2, chosen, discarded };
  }


  rollWithDisadvantage(): AdvantageResult {
    const [roll1, roll2] = withoutNestedDiceRollTrace(this.cls, () => [
      this.roll(20),
      this.roll(20),
    ]);
    const chosen = Math.min(roll1, roll2);
    const discarded = Math.max(roll1, roll2);
    recordDiceRollTrace(this.cls, {
      expression: "2d20kl1",
      rolls: [roll1, roll2],
      modifier: 0,
      total: chosen,
      dropped: [discarded],
    });
    return { roll1, roll2, chosen, discarded };
  }


  rollInitiative(
    modifier: number,
    options?: { advantage?: boolean },
  ): InitiativeResult {
    const rolls = withoutNestedDiceRollTrace(this.cls, () => {
      const values = [this.roll(20)];
      if (options?.advantage) values.push(this.roll(20));
      return values;
    });
    const roll = Math.max(...rolls);
    const result = {
      roll,
      modifier,
      total: roll + modifier,
    };
    recordDiceRollTrace(this.cls, {
      expression: options?.advantage ? "2d20kh1" : "1d20",
      rolls,
      modifier,
      total: result.total,
      dropped:
        options?.advantage && rolls.length > 1
          ? [Math.min(...rolls)]
          : undefined,
    });
    return result;
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
