import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { buildElementalSpiritStatBlock } from "./summon-stat-block";

describe("ConditionLifecycleService creature immunities", () => {
  it.each(["exhaustion", "paralyzed", "petrified", "poisoned"] as const)(
    "blocks %s on an Elemental Spirit",
    async (slug) => {
      const participants = {
        save: jest.fn(async (value) => value),
        findOne: jest.fn(),
      };
      const service = new ConditionLifecycleService(
        participants as never,
        { find: jest.fn(async () => []) } as never,
        {} as never,
        {} as never,
      );
      const target = {
        id: "elemental-spirit",
        displayName: "Elemental Spirit (Fogo)",
        type: "monster",
        conditions: [],
        conditionInstances: [],
        appliedEffects: [
          {
            kind: "summon",
            metadata: {
              statBlock: buildElementalSpiritStatBlock({
                form: "fire",
                slotLevel: 6,
                spellAttackBonus: 11,
              }),
            },
          },
        ],
      };

      const result = await service.applyCondition(target as never, { slug });

      expect(target.conditions).toEqual([]);
      expect(target.conditionInstances).toEqual([]);
      expect(participants.save).not.toHaveBeenCalled();
      expect(result.events).toEqual([
        expect.objectContaining({
          event_type: "condition_blocked_by_immunity",
          target_participant_id: target.id,
          data: expect.objectContaining({
            slug,
            source: "elemental-spirit",
          }),
        }),
      ]);
    },
  );
});
