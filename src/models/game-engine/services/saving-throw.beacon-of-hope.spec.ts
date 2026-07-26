import { SavingThrowService } from "./saving-throw.service";

describe("SavingThrowService — Beacon of Hope", () => {
  it("rolls two d20s for a Wisdom save and exposes both in result and log", async () => {
    const participant = {
      id: "target",
      type: "pc",
      characterId: "character",
      encounterId: "encounter",
      effectInstances: [
        {
          kind: "beacon_of_hope",
          requiresConcentration: true,
        },
      ],
    };
    const rolls = [3, 16];
    const dice = {
      roll: jest.fn(() => rolls.shift() ?? 1),
      rollExpression: jest.fn(),
    };
    const participants = {
      findOne: jest.fn(async () => participant),
      find: jest.fn(async () => []),
      save: jest.fn(async (value) => value),
    };
    const service = new SavingThrowService(
      {
        computeSheet: jest.fn(async () => ({
          savingThrows: [{ slug: "wis", name: "Wisdom", bonus: 4 }],
          conditions: [],
          race: { slug: "human", name: "Human" },
          classes: [],
          abilityScores: [],
          totalLevel: 9,
        })),
      } as never,
      dice as never,
      {
        getSavingThrowModifiers: () => ({
          hasAdvantage: false,
          hasDisadvantage: false,
          autoFail: false,
        }),
      } as never,
      { emit: jest.fn() } as never,
      {
        consumeIfArmed: jest.fn(async () => ({ consumed: false })),
      } as never,
      {
        getModifiers: () => ({ d20Penalty: 0 }),
      } as never,
      participants as never,
      { findOne: jest.fn(async () => null) } as never,
    );

    const result = await service.rollSavingThrow({
      characterId: "character",
      userId: "user",
      participantId: "target",
      ability: "wis",
      dc: 15,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dice.roll).toHaveBeenCalledTimes(2);
    expect(result.value).toMatchObject({
      roll: 16,
      total: 20,
      success: true,
      advantage: {
        roll1: 3,
        roll2: 16,
        chosen: 16,
        discarded: 3,
      },
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "saving_throw",
        data: expect.objectContaining({
          hasAdvantage: true,
          advantage: expect.objectContaining({
            roll1: 3,
            roll2: 16,
            chosen: 16,
          }),
        }),
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "beacon_of_hope_wisdom_save_advantage",
        data: expect.objectContaining({
          roll1: 3,
          roll2: 16,
          chosen: 16,
        }),
      }),
    );
  });
});
