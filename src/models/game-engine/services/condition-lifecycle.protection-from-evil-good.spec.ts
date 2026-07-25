import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService — Protection from Evil and Good", () => {
  it("blocks Charmed from an Undead source while the effect is active", async () => {
    const source = {
      id: "ghoul",
      type: "monster",
      monster: { type: "undead" },
      appliedEffects: [],
    };
    const target = {
      id: "paladin",
      type: "pc",
      conditions: [],
      conditionInstances: [],
      effectInstances: [
        {
          id: "protection",
          kind: "protection_from_evil_good",
          sourceSpellSlug: "protection-from-evil-and-good",
          expiresAt: { kind: "concentration" },
          payload: {},
        },
      ],
    };
    const participants = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === source.id ? source : target,
      ),
      save: jest.fn(async (value) => value),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      { find: jest.fn(async () => []) } as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyCondition(target as never, {
      slug: "charmed",
      appliedBy: source.id,
      source: "ability:ghoul-charm" as never,
    });

    expect(result.events).toEqual([
      expect.objectContaining({
        event_type: "condition_blocked_by_immunity",
        data: expect.objectContaining({
          slug: "charmed",
          source: "protection-from-evil-and-good",
          feature: "Protection from Evil and Good",
        }),
      }),
    ]);
    expect(target.conditions).toEqual([]);
  });
});
