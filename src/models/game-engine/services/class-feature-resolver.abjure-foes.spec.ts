import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Abjure Foes", () => {
  function setup() {
    const source = {
      id: "paladin-1",
      encounterId: "encounter-1",
      displayName: "Paladino",
      faction: "ally",
      positionX: 5,
      positionY: 5,
      isDefeated: false,
    };
    const nearEnemy = {
      id: "enemy-near",
      encounterId: "encounter-1",
      type: "monster",
      displayName: "Ogre",
      faction: "enemy",
      positionX: 10,
      positionY: 5,
      isDefeated: false,
      monster: { wisdom: 7 },
    };
    const farEnemy = {
      ...nearEnemy,
      id: "enemy-far",
      displayName: "Ogre distante",
      positionX: 18,
    };
    const all = [source, nearEnemy, farEnemy];
    const participants = {
      findOne: jest.fn(async ({ where: { id } }) =>
        all.find((participant) => participant.id === id) ?? null,
      ),
      find: jest.fn(async ({ where }) => {
        const ids = Array.isArray(where)
          ? where.map((entry) => entry.id)
          : [];
        return all.filter((participant) => ids.includes(participant.id));
      }),
      save: jest.fn(async (value) => value),
    };
    let conditionCounter = 0;
    const conditionLifecycle = {
      applyCondition: jest.fn(async (_target, input) => ({
        events: [
          {
            event_type: "condition_applied",
            data: { slug: input.slug, source: input.source },
          },
        ],
        instance: {
          id: `condition-${++conditionCounter}`,
          ...input,
        },
        concentrationBroken: false,
      })),
    };
    const dice = { roll: jest.fn().mockReturnValue(5) };
    const service = new ClassFeatureResolverService(
      participants as any,
      {} as any,
      conditionLifecycle as any,
      {} as any,
      dice as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const caster = {
      profBonus: 5,
      classLevel: 15,
      abilityMods: { cha: 2 },
    };
    return {
      service,
      source,
      nearEnemy,
      farEnemy,
      conditionLifecycle,
      dice,
      caster,
    };
  }

  it("força SAB e aplica Amedrontado por 10 rodadas ou até dano", async () => {
    const {
      service,
      source,
      nearEnemy,
      conditionLifecycle,
      caster,
    } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "abjure-foes",
      targets: [nearEnemy.id],
      saveDc: 15,
      caster,
    });

    expect(result.resolved).toBe(true);
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      nearEnemy,
      expect.objectContaining({
        slug: "frightened",
        source: "feature:abjure-foes",
        repeatSaveTiming: "never",
        durationRoundsRemaining: 10,
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "save_rolled",
        target_participant_id: nearEnemy.id,
        data: expect.objectContaining({
          ability: "wis",
          dc: 15,
          rolled: 5,
          modifier: -2,
          total: 3,
          success: false,
          source: "abjure-foes",
        }),
      }),
    );
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        maxTargets: 2,
        frightenedTargetIds: [nearEnemy.id],
      }),
    );
  });

  it("rejeita quantidade acima do modificador de Carisma sem aplicar condição", async () => {
    const {
      service,
      source,
      nearEnemy,
      farEnemy,
      conditionLifecycle,
      caster,
    } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "abjure-foes",
      targets: [nearEnemy.id, farEnemy.id],
      caster: { ...caster, abilityMods: { cha: 1 } },
    });

    expect(result.resolved).toBe(false);
    expect(conditionLifecycle.applyCondition).not.toHaveBeenCalled();
  });

  it("rejeita alvo além de 60 pés sem gastar a resolução", async () => {
    const {
      service,
      source,
      farEnemy,
      conditionLifecycle,
      caster,
    } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "abjure-foes",
      targets: [farEnemy.id],
      caster,
    });

    expect(result.resolved).toBe(false);
    expect(conditionLifecycle.applyCondition).not.toHaveBeenCalled();
  });
});
