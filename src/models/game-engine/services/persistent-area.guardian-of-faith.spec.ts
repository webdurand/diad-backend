import type { Repository } from "typeorm";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import type { ConditionLifecycleService } from "./condition-lifecycle.service";
import type { DiceService } from "./dice.service";
import { PersistentAreaService } from "./persistent-area.service";

function guardianArea(): PersistentAreaEffectEntity {
  return {
    id: "guardian-1",
    encounterId: "enc-1",
    casterParticipantId: "caster-1",
    sourceSpell: "guardian-of-faith",
    effectKind: "guardian-of-faith",
    shapeKind: "cube",
    originCell: { x: 5, y: 5 },
    radiusCells: 6,
    slotLevel: 4,
    saveDc: 17,
    damageDice: "20",
    damageType: "radiant",
    durationRoundsRemaining: 4800,
    sourceConcentration: false,
    tacticalMetadata: {
      tags: ["damage", "guardian", "stationary", "large", "radiant"],
      tacticalValue: 9,
      beneficiaryFaction: "caster",
      targeting: "hostile_only",
      casterFaction: "ally",
      damageBudgetTotal: 60,
      damageDealtTotal: 0,
    },
  } as PersistentAreaEffectEntity;
}

function hostile(): EncounterParticipantEntity {
  return {
    id: "target-1",
    encounterId: "enc-1",
    displayName: "Ogro",
    faction: "enemy",
    positionX: 1,
    positionY: 5,
    isDefeated: false,
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
  } as EncounterParticipantEntity;
}

describe("PersistentAreaService — Guardian of Faith", () => {
  it("rolls DEX and applies 20/10 radiant only once per turn", async () => {
    const area = guardianArea();
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValueOnce(2).mockReturnValueOnce(20),
      rollExpression: jest.fn().mockReturnValue({ total: 20 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = hostile();

    const failedEntry = await service.resolveEntry(
      target,
      { x: 3, y: 5 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "8:1",
      { x: 1, y: 5 },
    );
    expect(failedEntry.totalDamage).toBe(20);
    expect(failedEntry.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_save_rolled",
          data: expect.objectContaining({
            ability: "dex",
            total: 3,
            passed: false,
          }),
        }),
        expect.objectContaining({
          event_type: "tile_effect_damage_applied",
          data: expect.objectContaining({
            expression: "20",
            type: "radiant",
            amount: 20,
          }),
        }),
      ]),
    );

    const repeatedEntry = await service.resolveEntry(
      target,
      { x: 3, y: 5 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "8:1",
      { x: 1, y: 5 },
    );
    expect(repeatedEntry.events).toEqual([]);

    target.positionX = 3;
    target.positionY = 5;
    target.effectInstances = [];
    const passedStart = await service.resolveStartTurnIn(
      target,
      async () => ({ modifier: 1 }),
      "9:1",
    );
    expect(passedStart.totalDamage).toBe(10);
    expect(passedStart.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_save_rolled",
          data: expect.objectContaining({
            total: 21,
            passed: true,
          }),
        }),
        expect.objectContaining({
          event_type: "tile_effect_damage_applied",
          data: expect.objectContaining({ amount: 10 }),
        }),
      ]),
    );

    const reentryAfterStart = await service.resolveEntry(
      target,
      { x: 3, y: 5 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "9:1",
      { x: 1, y: 5 },
    );
    expect(reentryAfterStart.events).toEqual([]);
  });

  it("ignores allies", async () => {
    const area = guardianArea();
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn(),
      rollExpression: jest.fn(),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const ally = { ...hostile(), faction: "ally" } as EncounterParticipantEntity;

    const result = await service.resolveEntry(
      ally,
      { x: 3, y: 5 },
      "enc-1",
      undefined,
      "8:1",
      { x: 1, y: 5 },
    );

    expect(result.events).toEqual([]);
    expect(dice.roll).not.toHaveBeenCalled();
  });

  it("persists the real damage budget and deletes the guardian at 60", async () => {
    const area = guardianArea();
    const areaRepo = {
      findOne: jest.fn().mockResolvedValue(area),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const service = new PersistentAreaService(
      areaRepo,
      {} as DiceService,
      {} as ConditionLifecycleService,
    );

    const first = await service.recordGuardianOfFaithDamage(
      area.id,
      20,
      "target-1",
    );
    expect(area.tacticalMetadata?.damageDealtTotal).toBe(20);
    expect(first).toEqual([
      expect.objectContaining({
        event_type: "guardian_of_faith_damage_budget",
        data: expect.objectContaining({
          damageDealtTotal: 20,
          damageRemaining: 40,
        }),
      }),
    ]);

    const last = await service.recordGuardianOfFaithDamage(
      area.id,
      40,
      "target-2",
    );
    expect(areaRepo.delete).toHaveBeenCalledWith(area.id);
    expect(last).toEqual([
      expect.objectContaining({
        event_type: "guardian_of_faith_vanished",
        data: expect.objectContaining({
          damageDealtTotal: 60,
          damageRemaining: 0,
          reason: "damage_budget",
        }),
      }),
    ]);
  });
});
