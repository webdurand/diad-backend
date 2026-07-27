import type { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { AshPuffService, hasAshPuff } from "./ash-puff.service";
import type { ConditionLifecycleService } from "./condition-lifecycle.service";

function participant(
  id: string,
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id,
    encounterId: "encounter-1",
    type: "monster",
    displayName: id,
    currentHp: 10,
    maxHp: 10,
    tempHp: 0,
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
    appliedEffects: [],
    isDefeated: false,
    dyingState: "none",
    positionX: 5,
    positionY: 5,
    monster: {
      type: "beast",
      special_abilities: [],
    } as never,
    ...overrides,
  } as EncounterParticipantEntity;
}

const ashPuffAbility = [
  {
    name: "Ash Puff",
    desc: "The first time the zombie takes damage, living creatures within 5 feet make a DC 10 Constitution saving throw.",
  },
];

describe("AshPuffService", () => {
  it("recognizes Ash Puff in the monster special abilities", () => {
    expect(hasAshPuff(ashPuffAbility)).toBe(true);
    expect(hasAshPuff([{ name: "Undead Fortitude" }])).toBe(false);
  });

  it("fires once on positive damage, filters living targets at 5 feet, and persists failed saves for 10 rounds", async () => {
    const source = participant("ash", {
      displayName: "Ash Zombie",
      monster: {
        type: "undead",
        special_abilities: ashPuffAbility,
      } as never,
    });
    const fighter = participant("fighter", {
      type: "pc",
      characterId: "character-fighter",
      monster: undefined,
      positionX: 6,
    });
    const persistedFighter = participant("fighter", {
      type: "pc",
      characterId: "character-fighter",
      monster: undefined,
      positionX: 6,
    });
    const beast = participant("beast", {
      positionX: 4,
      positionY: 4,
    });
    const undead = participant("undead", {
      positionY: 4,
      monster: { type: "undead" } as never,
    });
    const construct = participant("construct", {
      positionY: 6,
      monster: { type: "construct" } as never,
    });
    const far = participant("far", { positionX: 7 });
    const defeated = participant("defeated", {
      positionX: 4,
      currentHp: 0,
      isDefeated: true,
    });

    const repository = {
      save: jest.fn(async (value) => value),
      find: jest
        .fn()
        .mockResolvedValue([
          source,
          persistedFighter,
          beast,
          undead,
          construct,
          far,
          defeated,
        ]),
    } as unknown as Repository<EncounterParticipantEntity>;
    const conditions = {
      applyCondition: jest.fn(async () => ({
        events: [
          {
            event_type: "condition_applied",
            target_participant_id: fighter.id,
            data: { slug: "ash_puff" },
          },
        ],
        instance: {},
        concentrationBroken: false,
      })),
    } as unknown as ConditionLifecycleService;
    const service = new AshPuffService(repository, conditions);
    const rollSavingThrow = jest.fn(async (target) => ({
      ability: "con",
      dc: 10,
      roll: target.id === fighter.id ? 2 : 15,
      modifier: 0,
      total: target.id === fighter.id ? 2 : 15,
      success: target.id !== fighter.id,
    }));

    const result = await service.triggerAfterMonsterDamage({
      source,
      damageApplied: 7,
      knownParticipants: [fighter],
      rollSavingThrow,
    });

    expect(result.triggered).toBe(true);
    expect(result.affectedParticipantIds).toEqual(["fighter", "beast"]);
    expect(rollSavingThrow).toHaveBeenCalledTimes(2);
    expect(conditions.applyCondition).toHaveBeenCalledTimes(1);
    expect(conditions.applyCondition).toHaveBeenCalledWith(
      fighter,
      expect.objectContaining({
        slug: "ash_puff",
        appliedBy: "ash",
        source: "ability:ash-puff",
        saveAbility: "con",
        saveDc: 10,
        repeatSaveTiming: "end_of_turn",
        durationRoundsRemaining: 10,
      }),
    );
    expect(source.effectInstances).toEqual([
      expect.objectContaining({
        kind: "ash_puff_triggered",
        sourceFeatureSlug: "ash-puff",
        expiresAt: { kind: "end_of_encounter" },
      }),
    ]);
    expect(result.events.map((event) => event.event_type)).toEqual([
      "ash_puff_triggered",
      "save_rolled",
      "condition_applied",
      "save_rolled",
    ]);

    const repeated = await service.triggerAfterMonsterDamage({
      source,
      damageApplied: 6,
      rollSavingThrow,
    });
    expect(repeated).toEqual({
      triggered: false,
      affectedParticipantIds: [],
      events: [],
    });
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(rollSavingThrow).toHaveBeenCalledTimes(2);
  });

  it("does not consume Ash Puff on zero damage", async () => {
    const source = participant("ash", {
      monster: {
        type: "undead",
        special_abilities: ashPuffAbility,
      } as never,
    });
    const repository = {
      save: jest.fn(),
      find: jest.fn(),
    } as unknown as Repository<EncounterParticipantEntity>;
    const conditions = {
      applyCondition: jest.fn(),
    } as unknown as ConditionLifecycleService;
    const service = new AshPuffService(repository, conditions);

    await expect(
      service.triggerAfterMonsterDamage({
        source,
        damageApplied: 0,
        rollSavingThrow: jest.fn(),
      }),
    ).resolves.toEqual({
      triggered: false,
      affectedParticipantIds: [],
      events: [],
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
