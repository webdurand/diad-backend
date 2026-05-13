import { randomUUID } from "crypto";

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DiceService } from "./dice.service";
import {
  DiceModifierBreakdown,
  DiceRollAdvantage,
  DiceRollKind,
  DiceRollRequest,
  DiceRollResolved,
  DiceVerdict,
} from "../interfaces/dice.interfaces";



interface RequestState {
  rollId: string;
  characterId?: string;
  kind: DiceRollKind;
  ability: DiceRollRequest["ability"];
  skill: string | null;
  dc: number;
  advantage: DiceRollAdvantage;
  modifiers: DiceModifierBreakdown[];
  totalModifier: number;
  targetD20: number;
  createdAt: number;
  resolved?: DiceRollResolved;
}

const TTL_MS = 60 * 60 * 1000;

export interface RequestRollInput {
  characterId?: string;
  kind: DiceRollKind;
  ability: DiceRollRequest["ability"];
  skill?: string | null;
  dc: number;
  advantage?: DiceRollAdvantage;
  modifiers: DiceModifierBreakdown[];
  narrativeFraming?: string;
}

export interface RequestRollResult {
  rollId: string;
  targetD20: number;
  totalModifier: number;
  payloadForSse: DiceRollRequest;
}

export interface ResolveRollResult {
  rollId: string;
  total: number;
  verdict: DiceVerdict;
  rawD20: number;
  rawD20Disadv?: number | null;
}

export interface PassiveCheckInput {
  characterId?: string;
  kind: DiceRollKind;
  dc: number;
  modifierTotal: number;
}

@Injectable()
export class DiceRollService {
  private readonly logger = new Logger(DiceRollService.name);
  private readonly store = new Map<string, RequestState>();

  constructor(private readonly diceService: DiceService) {}


  requestRoll(input: RequestRollInput): RequestRollResult {
    this.purgeExpired();

    const payload = this.diceService.buildDiceRollRequest({
      kind: input.kind,
      ability: input.ability,
      skill: input.skill ?? null,
      dc: input.dc,
      modifiers: input.modifiers,
      advantage: input.advantage,
      characterId: input.characterId,
      narrativeFraming: input.narrativeFraming,
    });

    const state: RequestState = {
      rollId: payload.rollId,
      characterId: input.characterId,
      kind: payload.kind,
      ability: payload.ability,
      skill: payload.skill,
      dc: payload.dc,
      advantage: payload.advantage,
      modifiers: payload.modifiers,
      totalModifier: payload.totalModifier,
      targetD20: payload.targetD20,
      createdAt: Date.now(),
    };
    this.store.set(state.rollId, state);

    return {
      rollId: state.rollId,
      targetD20: state.targetD20,
      totalModifier: state.totalModifier,
      payloadForSse: payload,
    };
  }


  resolveRoll(rollId: string, raw1: number, raw2?: number): ResolveRollResult {
    this.purgeExpired();
    const state = this.store.get(rollId);
    if (!state) {
      throw new NotFoundException(
        `Dice roll request '${rollId}' não encontrado (expirou ou nunca existiu).`,
      );
    }
    this.validateRaw(raw1);
    if (raw2 !== undefined) this.validateRaw(raw2);

    let chosen: number;
    let discarded: number | null = null;

    if (state.advantage === "advantage") {
      const second = raw2 ?? raw1;
      chosen = Math.max(raw1, second);
      discarded = Math.min(raw1, second);
    } else if (state.advantage === "disadvantage") {
      const second = raw2 ?? raw1;
      chosen = Math.min(raw1, second);
      discarded = Math.max(raw1, second);
    } else {
      chosen = raw1;
    }

    const resolved = this.diceService.resolveDiceRoll({
      rollId: state.rollId,
      rawD20: chosen,
      rawD20Disadv: discarded,
      totalModifier: state.totalModifier,
      dc: state.dc,
      kind: state.kind,
    });

    state.resolved = resolved;

    return {
      rollId: resolved.rollId,
      total: resolved.total,
      verdict: resolved.verdict,
      rawD20: resolved.rawD20,
      rawD20Disadv: resolved.rawD20Disadv,
    };
  }


  passiveCheck(input: PassiveCheckInput): {
    success: boolean;
    verdict: DiceVerdict;
    total: number;
    rollId: string;
  } {

    const rollId = randomUUID();
    const resolved = this.diceService.resolveDiceRoll({
      rollId,
      rawD20: 10,
      rawD20Disadv: null,
      totalModifier: input.modifierTotal,
      dc: input.dc,
      kind: input.kind,
    });
    return {
      success:
        resolved.verdict === "success" || resolved.verdict === "crit_success",
      verdict: resolved.verdict,
      total: resolved.total,
      rollId,
    };
  }


  getRequestState(rollId: string): RequestState | undefined {
    return this.store.get(rollId);
  }

  private validateRaw(raw: number): void {
    if (!Number.isInteger(raw) || raw < 1 || raw > 20) {
      throw new NotFoundException(
        `rawD20 inválido (${raw}). Esperado inteiro entre 1 e 20.`,
      );
    }
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, st] of this.store.entries()) {
      if (st.createdAt < cutoff) this.store.delete(id);
    }
  }
}
