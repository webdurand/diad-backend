import type { ClsService } from "nestjs-cls";
import {
  beginDiceRollTrace,
  readDiceRollTrace,
  recordDiceRollTrace,
  withoutNestedDiceRollTrace,
} from "src/common/dice/dice-roll-trace.context";
import { FakeClsService } from "src/common/request-cache/__tests__/fake-cls";
import { DiceService } from "../services/dice.service";

const asCls = (fake: FakeClsService): ClsService =>
  fake as unknown as ClsService;

function tracedDice(commandId = "command-1"): {
  cls: FakeClsService;
  dice: DiceService;
} {
  const cls = new FakeClsService(true);
  beginDiceRollTrace(asCls(cls), {
    encounterId: "enc-1",
    commandId,
    visibility: "room",
    rollerParticipantIds: ["hero-1"],
  });
  const dice = new DiceService(asCls(cls));
  dice.setSeed(42);
  return { cls, dice };
}

describe("Dice roll trace", () => {
  it("agrega rollMultiple em um unico trace, sem registrar cada dado interno", () => {
    const { cls, dice } = tracedDice();

    const values = dice.rollMultiple(3, 8);
    const traces = readDiceRollTrace(asCls(cls));

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      commandId: "command-1",
      visibility: "room",
      rollerParticipantIds: ["hero-1"],
      expression: "3d8",
      rolls: values,
      modifier: 0,
      total: values.reduce((sum, value) => sum + value, 0),
    });
  });

  it("agrega expressao com keep e modificador em um unico trace", () => {
    const { cls, dice } = tracedDice();

    const result = dice.rollExpression("2d20kh1+4");
    const traces = readDiceRollTrace(asCls(cls));

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      expression: "2d20kh1+4",
      rolls: result.rolls,
      modifier: 4,
      total: result.total,
      dropped: result.dropped,
    });
  });

  it.each([
    ["vantagem", "2d20kh1", (dice: DiceService) => dice.rollWithAdvantage()],
    [
      "desvantagem",
      "2d20kl1",
      (dice: DiceService) => dice.rollWithDisadvantage(),
    ],
  ])("agrega %s em um unico trace", (_label, expression, operation) => {
    const { cls, dice } = tracedDice();

    const result = operation(dice);
    const traces = readDiceRollTrace(asCls(cls));

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      expression,
      rolls: [result.roll1, result.roll2],
      modifier: 0,
      total: result.chosen,
      dropped: [result.discarded],
    });
  });

  it.each([
    ["normal", undefined, "1d20", 1],
    ["com vantagem", { advantage: true }, "2d20kh1", 2],
  ])(
    "agrega iniciativa %s em um unico trace",
    (_label, options, expression, rollCount) => {
      const { cls, dice } = tracedDice();

      const result = dice.rollInitiative(3, options);
      const traces = readDiceRollTrace(asCls(cls));

      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        expression,
        modifier: 3,
        total: result.total,
      });
      expect(traces[0].rolls).toHaveLength(rollCount);
      expect(result.roll).toBe(Math.max(...traces[0].rolls));
    },
  );

  it("nao registra trace quando a visibilidade e none", () => {
    const cls = new FakeClsService(true);
    beginDiceRollTrace(asCls(cls), {
      encounterId: "enc-secret",
      visibility: "none",
    });

    new DiceService(asCls(cls)).rollExpression("2d8+2");

    expect(readDiceRollTrace(asCls(cls))).toEqual([]);
  });

  it("isola os traces entre instancias de CLS", () => {
    const first = tracedDice("first");
    const second = tracedDice("second");

    first.dice.roll(6);
    second.dice.roll(12);

    expect(readDiceRollTrace(asCls(first.cls))).toEqual([
      expect.objectContaining({
        commandId: "first",
        expression: "1d6",
      }),
    ]);
    expect(readDiceRollTrace(asCls(second.cls))).toEqual([
      expect.objectContaining({
        commandId: "second",
        expression: "1d12",
      }),
    ]);
  });

  it("restaura suppressDepth mesmo quando a operacao lanca erro", () => {
    const { cls } = tracedDice();

    expect(() =>
      withoutNestedDiceRollTrace(asCls(cls), () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    recordDiceRollTrace(asCls(cls), {
      expression: "1d6",
      rolls: [4],
      modifier: 0,
      total: 4,
    });

    expect(readDiceRollTrace(asCls(cls))).toEqual([
      expect.objectContaining({ expression: "1d6", rolls: [4], total: 4 }),
    ]);
  });
});
