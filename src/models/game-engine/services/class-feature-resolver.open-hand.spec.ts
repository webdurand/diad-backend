import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Open Hand Technique", () => {
  const source = {
    id: "monk-1",
    encounterId: "encounter-1",
    positionX: 10,
    positionY: 10,
    effectInstances: [],
  } as any;
  const target = {
    id: "ogre-1",
    encounterId: "encounter-1",
    type: "monster",
    isDefeated: false,
    positionX: 10,
    positionY: 9,
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
    monster: {
      strength: 19,
      dexterity: 8,
      constitution: 16,
    },
  } as any;
  const participants = {
    findOne: jest.fn(async ({ where: { id } }: any) =>
      id === source.id ? source : target,
    ),
    find: jest.fn(async () => [source, target]),
    save: jest.fn(async (participant: any) => participant),
  };
  const conditionLifecycle = {
    applyCondition: jest.fn(async (participant: any, input: any) => {
      participant.conditions = [...participant.conditions, input.slug];
      return {
        instance: { id: `condition-${input.slug}` },
        events: [{ event_type: "condition_applied", data: input }],
      };
    }),
  };
  const effectInstances = {
    addEffect: jest.fn(async (participant: any, input: any) => {
      const effect = { id: `effect-${input.kind}`, ...input };
      participant.effectInstances = [
        ...(participant.effectInstances ?? []),
        effect,
      ];
      return {
        effect,
        events: [{ event_type: "effect_applied", data: input }],
      };
    }),
  };
  const dice = { roll: jest.fn() };
  const persistentArea = {
    removeLocationBoundConditionsOutsideAreas: jest.fn(async () => [
      {
        event_type: "condition_removed",
        target_participant_id: target.id,
        data: { slug: "truth_bound", removalReason: "left_area" },
      },
    ]),
  };

  const makeService = () =>
    new ClassFeatureResolverService(
      participants as never,
      {} as never,
      conditionLifecycle as never,
      effectInstances as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
      persistentArea as never,
    );

  const arm = () => {
    source.effectInstances = [
      {
        id: "pending-open-hand",
        kind: "open_hand_technique_pending",
        payload: { requiredTargetId: target.id },
      },
    ];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    source.positionX = 10;
    source.positionY = 10;
    target.positionX = 10;
    target.positionY = 9;
    target.conditions = [];
    target.effectInstances = [];
    arm();
  });

  it("applies Addle without a save until the target's next turn", async () => {
    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "open-hand-technique-addle",
      targets: [target.id],
      saveDc: 11,
    });

    expect(result.resolved).toBe(true);
    expect(effectInstances.addEffect).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        kind: "opportunity_attacks_blocked",
        expiresAt: { kind: "until_target_turn", value: 1 },
      }),
    );
    expect(source.effectInstances).toEqual([]);
  });

  it("uses the monster's Strength modifier and pushes 15 feet on a failure", async () => {
    dice.roll.mockReturnValue(4);

    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "open-hand-technique-push",
      targets: [target.id],
      saveDc: 11,
    });

    expect(result.resolutionPayload).toMatchObject({
      saved: false,
      forcedMovement: {
        from: { x: 10, y: 9 },
        to: { x: 10, y: 6 },
        distanceFt: 15,
      },
    });
    expect(
      result.events.find((event) => event.event_type === "save_rolled")?.data,
    ).toMatchObject({ modifier: 4, total: 8, success: false });
    expect(
      persistentArea.removeLocationBoundConditionsOutsideAreas,
    ).toHaveBeenCalledWith(target, { x: 10, y: 6 });
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "condition_removed" }),
      ]),
    );
  });

  it("uses the monster's Dexterity modifier and applies Prone on a failure", async () => {
    dice.roll.mockReturnValue(5);

    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "open-hand-technique-topple",
      targets: [target.id],
      saveDc: 11,
    });

    expect(result.resolutionPayload).toMatchObject({
      saved: false,
      proneApplied: true,
    });
    expect(
      result.events.find((event) => event.event_type === "save_rolled")?.data,
    ).toMatchObject({ modifier: -1, total: 4, success: false });
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ slug: "prone" }),
    );
    expect(
      persistentArea.removeLocationBoundConditionsOutsideAreas,
    ).not.toHaveBeenCalled();
  });
});
