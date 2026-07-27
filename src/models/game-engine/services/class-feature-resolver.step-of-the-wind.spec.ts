import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Step of the Wind (2024)", () => {
  function setup() {
    const monk = {
      id: "monk-1",
      movementRemaining: 30,
      hasDashed: false,
      hasDisengaged: false,
      effectInstances: [],
    };
    const participants = {
      findOne: jest.fn().mockResolvedValue(monk),
      save: jest.fn(async (value: any) => value),
    };
    const service = new ClassFeatureResolverService(
      participants as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { monk, participants, service };
  }

  it("soma a velocidade atual ao movimento parcialmente gasto na opção paga", async () => {
    const { monk, participants, service } = setup();

    const result = await service.resolveInvocation(monk.id, {
      featureSlug: "step-of-the-wind",
      caster: {
        speed: 40,
        is2024Rules: true,
      },
    });

    expect(result.resolved).toBe(true);
    expect(monk.movementRemaining).toBe(70);
    expect(monk.hasDashed).toBe(true);
    expect(monk.hasDisengaged).toBe(true);
    expect(participants.save).toHaveBeenCalledWith(monk);
  });

  it("soma a velocidade atual ao movimento parcialmente gasto na opção gratuita", async () => {
    const { monk, participants, service } = setup();

    const result = await service.resolveInvocation(monk.id, {
      featureSlug: "step-of-the-wind-dash",
      caster: {
        speed: 40,
        is2024Rules: true,
      },
    });

    expect(result.resolved).toBe(true);
    expect(monk.movementRemaining).toBe(70);
    expect(monk.hasDashed).toBe(true);
    expect(monk.hasDisengaged).toBe(false);
    expect(result.events.at(-1)?.data).toEqual({
      focusPointsCost: 0,
      dashed: true,
      disengaged: false,
    });
    expect(participants.save).toHaveBeenCalledWith(monk);
  });
});
