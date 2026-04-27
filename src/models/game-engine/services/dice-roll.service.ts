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

/**
 * Spec 016 M2 — Dice request lifecycle service.
 *
 * Encapsula o fluxo de active dice checks (chat-driven SSE):
 *   1. requestRoll(): cria um RequestState + payload pro frontend renderizar
 *      `<DiceRollCard>`. Storage in-memory por enquanto (TTL 1h) — não exige
 *      migration. M3 promove pra entity persistida quando precisar replay.
 *   2. resolveRoll(): consome rawD20 do frontend, computa verdict, marca
 *      como resolved.
 *   3. passiveCheck(): mesmo cálculo verdict mas SEM emitir SSE / sem persist.
 *
 * Targeting (`targetD20 = max(2, dc - totalModifier)`) delegado ao
 * DiceService.buildDiceRollRequest pra manter SRP.
 */

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

const TTL_MS = 60 * 60 * 1000; // 1h — declared in spec as MVP retention

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

  /**
   * Cria um active dice check. Retorna rollId pro frontend renderizar
   * `<DiceRollCard>` + payload pro SSE event chunk.
   */
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

  /**
   * Resolve um active dice check.
   * - advantage='advantage': escolhe max(raw1, raw2)
   * - advantage='disadvantage': escolhe min(raw1, raw2)
   * - advantage='normal': usa raw1 (raw2 ignorado)
   */
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

  /**
   * Passive check (Perception, Investigation, Insight). Mesmo verdict
   * compute do active check, mas sem emitir SSE event e sem armazenar
   * RequestState. Usado por triggers de exploração (perceive secret door,
   * notice ambush, sense lie).
   */
  passiveCheck(input: PassiveCheckInput): {
    success: boolean;
    verdict: DiceVerdict;
    total: number;
    rollId: string;
  } {
    // Passive: rawD20 = 10 (RAW PHB 2024 — passive score = 10 + modifiers).
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

  /**
   * Útil em testes / probes. Não exposto via HTTP.
   */
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
