import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Healing Hands", () => {
  function setup(currentHp = 80) {
    const source = {
      id: "aasimar-1",
      encounterId: "encounter-1",
      characterId: "char-aasimar",
      displayName: "Aasimar",
      positionX: 5,
      positionY: 5,
      currentHp,
      maxHp: 100,
      isDefeated: false,
      dyingState: "none",
    };
    const target = { ...source };
    const participants = {
      findOne: jest.fn(async ({ where: { id } }) =>
        id === source.id ? source : id === "ally-1" ? target : null,
      ),
      save: jest.fn(async (value) => value),
    };
    const state = {
      character_id: source.characterId,
      current_hp: currentHp,
    };
    const charStates = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const dice = { roll: jest.fn().mockReturnValue(3) };
    const service = new ClassFeatureResolverService(
      participants as any,
      charStates as any,
      {} as any,
      {} as any,
      dice as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, source, target, participants, charStates, dice, state };
  }

  it("rola um d4 por bônus de proficiência, limita ao máximo e persiste", async () => {
    const { service, source, participants, charStates, dice, state } =
      setup(94);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "healing-hands",
      targets: [source.id],
      caster: { profBonus: 5, classLevel: 15 },
    });

    expect(result.resolved).toBe(true);
    expect(dice.roll).toHaveBeenCalledTimes(5);
    expect(state.current_hp).toBe(100);
    expect(source.currentHp).toBe(100);
    expect(charStates.save).toHaveBeenCalledWith(state);
    expect(participants.save).toHaveBeenCalledWith(source);
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        diceExpression: "5d4",
        rolled: 15,
        healingApplied: 6,
        previousHp: 94,
        newHp: 100,
      }),
    );
  });

  it("rejeita alvo fora do alcance sem rolar nem curar", async () => {
    const { service, source, target, dice, charStates } = setup(80);
    target.id = "ally-1";
    target.characterId = "char-ally";
    target.positionX = 7;

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "healing-hands",
      targets: [target.id],
      caster: { profBonus: 5, classLevel: 15 },
    });

    expect(result.resolved).toBe(false);
    expect(dice.roll).not.toHaveBeenCalled();
    expect(charStates.save).not.toHaveBeenCalled();
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "class_feature_error",
          data: expect.objectContaining({ featureSlug: "healing-hands" }),
        }),
      ]),
    );
  });
});
