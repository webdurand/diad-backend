import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService — Paladin auras", () => {
  it("emits an immunity event and does not persist a blocked condition", async () => {
    const participantRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const paladinAuras = {
      getConditionImmunity: jest.fn().mockResolvedValue({
        sourceParticipantId: "paladin",
        sourceName: "Devotion Paladin",
        featureSlug: "aura-of-courage",
        radiusFeet: 10,
        bonus: 0,
      }),
    };
    const service = new ConditionLifecycleService(
      participantRepo as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      paladinAuras as never,
    );
    const target = {
      id: "ally",
      encounterId: "encounter",
      displayName: "Ally",
      type: "pc",
      characterId: "ally-character",
      conditions: [],
      conditionInstances: [],
    } as never;

    const result = await service.applyCondition(target, {
      slug: "frightened",
      appliedBy: "dragon",
      source: "ability:frightful-presence",
    });

    expect(participantRepo.save).not.toHaveBeenCalled();
    expect(result.events).toEqual([
      expect.objectContaining({
        event_type: "condition_blocked_by_immunity",
        data: expect.objectContaining({
          slug: "frightened",
          source: "aura-of-courage",
          feature: "Aura da Coragem",
          sourceParticipantName: "Devotion Paladin",
        }),
      }),
    ]);
  });
});
