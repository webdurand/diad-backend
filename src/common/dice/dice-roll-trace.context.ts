import { randomUUID } from "crypto";

import type { ClsService } from "nestjs-cls";

const DICE_ROLL_TRACE_KEY = "diad:dice-roll-trace";
const MAX_ROLLS_PER_COMMAND = 256;

export interface DiceRollTrace {
  id: string;
  commandId?: string;
  visibility: "room";
  rollerParticipantIds?: string[];
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  dropped?: number[];
}

type DiceRollTraceInput = Pick<
  DiceRollTrace,
  "expression" | "rolls" | "modifier" | "total" | "dropped"
>;

interface DiceRollTraceState {
  encounterId: string;
  commandId?: string;
  visibility: "room" | "none";
  rollerParticipantIds: string[];
  rolls: DiceRollTrace[];
  suppressDepth: number;
}

export function beginDiceRollTrace(
  cls: ClsService | undefined,
  input: {
    encounterId: string;
    commandId?: string;
    visibility: "room" | "none";
    rollerParticipantIds?: string[];
  },
): void {
  if (!cls?.isActive()) return;
  cls.set<DiceRollTraceState>(DICE_ROLL_TRACE_KEY, {
    encounterId: input.encounterId,
    commandId: input.commandId,
    visibility: input.visibility,
    rollerParticipantIds: [...new Set(input.rollerParticipantIds ?? [])],
    rolls: [],
    suppressDepth: 0,
  });
}

export function readDiceRollTrace(
  cls: ClsService | undefined,
): DiceRollTrace[] {
  if (!cls?.isActive()) return [];
  const state = cls.get<DiceRollTraceState | undefined>(DICE_ROLL_TRACE_KEY);
  return (
    state?.rolls.map((roll) => ({
      ...roll,
      rolls: [...roll.rolls],
      dropped: roll.dropped ? [...roll.dropped] : undefined,
      rollerParticipantIds: roll.rollerParticipantIds
        ? [...roll.rollerParticipantIds]
        : undefined,
    })) ?? []
  );
}

export function recordDiceRollTrace(
  cls: ClsService | undefined,
  roll: DiceRollTraceInput,
): void {
  if (!cls?.isActive()) return;
  const state = cls.get<DiceRollTraceState | undefined>(DICE_ROLL_TRACE_KEY);
  if (
    !state ||
    state.visibility !== "room" ||
    state.suppressDepth > 0 ||
    state.rolls.length >= MAX_ROLLS_PER_COMMAND ||
    roll.rolls.length === 0
  ) {
    return;
  }

  state.rolls.push({
    id: randomUUID(),
    commandId: state.commandId,
    visibility: "room",
    rollerParticipantIds:
      state.rollerParticipantIds.length > 0
        ? [...state.rollerParticipantIds]
        : undefined,
    expression: roll.expression,
    rolls: [...roll.rolls],
    modifier: roll.modifier,
    total: roll.total,
    dropped: roll.dropped ? [...roll.dropped] : undefined,
  });
}

export function withoutNestedDiceRollTrace<T>(
  cls: ClsService | undefined,
  operation: () => T,
): T {
  if (!cls?.isActive()) return operation();
  const state = cls.get<DiceRollTraceState | undefined>(DICE_ROLL_TRACE_KEY);
  if (!state) return operation();

  state.suppressDepth += 1;
  try {
    return operation();
  } finally {
    state.suppressDepth = Math.max(0, state.suppressDepth - 1);
  }
}
