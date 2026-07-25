import { MonsterActionAdapterResolver } from "./monster-action-adapter.resolver";

describe("MonsterActionAdapterResolver — save condition actions", () => {
  it("exposes Fey Charm as a targetable special action", async () => {
    const resolver = new MonsterActionAdapterResolver();
    const [action] = await resolver.list({
      type: "monster",
      monsterSlug: "dryad",
      monsterActions: [
        {
          name: "Fey Charm",
          // Monster mapping normalizes missing attack bonuses to zero.
          attackBonus: 0,
          desc: "The dryad targets one humanoid or beast that she can see within 30 feet of her. If the target can see the dryad, it must succeed on a DC 14 Wisdom saving throw or be magically charmed.",
        },
      ],
      actionEconomy: {
        isOnTurn: true,
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        attacksUsedThisTurn: 0,
        attacksMaxThisTurn: 1,
      },
    });

    expect(action).toEqual(
      expect.objectContaining({
        displayName: "Fey Charm",
        kind: "special",
        targetShape: "single-creature",
        targetRange: 30,
        available: true,
      }),
    );
    expect(action.metadata).toEqual(
      expect.objectContaining({
        saveAbility: "wis",
        saveDc: 14,
      }),
    );
  });
});
