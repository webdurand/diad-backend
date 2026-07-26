import type { Repository } from "typeorm";
import type { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaService } from "./persistent-area.service";
import type { DiceService } from "./dice.service";
import type { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("PersistentAreaService runtime triggers", () => {
  it("persists Conjure Animals upcast damage from non-start-turn triggers", async () => {
    const areaRepo = {
      create: jest.fn((value) => ({ id: "area-ca", ...value })),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const service = new PersistentAreaService(
      areaRepo,
      {} as DiceService,
      {} as ConditionLifecycleService,
    );

    const area = await service.createFromCatalog({
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      spellSlug: "conjure-animals",
      slotLevel: 9,
      originCell: { x: 9, y: 8 },
      saveDc: 19,
      casterFaction: "ally",
    });

    expect(area).toEqual(
      expect.objectContaining({
        damageDice: "9d10",
        damageType: "slashing",
        saveAbility: "dex",
        halfOnSave: true,
      }),
    );
  });

  it("uses grid distance for self auras and Euclidean distance for point spheres", () => {
    const service = new PersistentAreaService(
      {} as Repository<PersistentAreaEffectEntity>,
      {} as DiceService,
      {} as ConditionLifecycleService,
    );
    const base = {
      originCell: { x: 5, y: 5 },
      radiusCells: 2,
      shapeKind: "sphere",
    } as unknown as PersistentAreaEffectEntity;

    expect(
      service.cellInArea(7, 7, { ...base, auraFollowsCaster: true }),
    ).toBe(true);
    expect(
      service.cellInArea(7, 7, { ...base, auraFollowsCaster: false }),
    ).toBe(false);
  });

  it("resolves a CWB entry when the caster moves the aura over a creature", async () => {
    const persistedArea = {
      id: "area-cwb",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-woodland-beings",
      effectKind: "conjure-woodland-beings",
      shapeKind: "sphere",
      originCell: { x: 0, y: 0 },
      radiusCells: 2,
      slotLevel: 4,
      saveDc: 15,
      auraFollowsCaster: true,
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
      save: jest.fn(async (area) => area),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(1),
      rollExpression: jest.fn().mockReturnValue({ total: 23 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Alvo",
      positionX: 3,
      positionY: 0,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;
    const persistParticipant = jest.fn().mockResolvedValue(undefined);

    const result = await service.relocateAurasByCaster(
      "caster-1",
      { x: 4, y: 0 },
      {
        participants: [target],
        getSaveModifier: async () => ({ modifier: 0 }),
        turnKey: "10:2",
        persistParticipant,
      },
    );

    expect(result.totalDamage).toBe(23);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_save_rolled",
          target_participant_id: "target-1",
        }),
        expect.objectContaining({
          event_type: "tile_effect_damage_applied",
          target_participant_id: "target-1",
          data: expect.objectContaining({
            effectKind: "conjure-woodland-beings",
            triggerKind: "on-enter",
            expression: "5d8",
            type: "force",
            amount: 23,
          }),
        }),
      ]),
    );
    expect(persistParticipant).toHaveBeenCalledWith(target);
  });

  it("never applies a following aura to its own caster", async () => {
    const persistedArea = {
      id: "area-cwb",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-woodland-beings",
      effectKind: "conjure-woodland-beings",
      shapeKind: "sphere",
      originCell: { x: 4, y: 4 },
      radiusCells: 2,
      slotLevel: 4,
      saveDc: 15,
      auraFollowsCaster: true,
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {} as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn(),
      rollExpression: jest.fn(),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const caster = {
      id: "caster-1",
      isDefeated: false,
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveOnCast(
      persistedArea,
      [caster],
      undefined,
      "10:2",
    );

    expect(result.totalDamage).toBe(0);
    expect(result.events).toEqual([]);
    expect(dice.roll).not.toHaveBeenCalled();
    expect(dice.rollExpression).not.toHaveBeenCalled();
  });

  it("rehydrates Cloud of Daggers damage calculators after JSONB persistence", async () => {
    const persistedArea = {
      id: "area-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "cloud-of-daggers",
      effectKind: "cloud-of-daggers",
      shapeKind: "cube",
      originCell: { x: 16, y: 4 },
      radiusCells: 1,
      slotLevel: 2,
      saveDc: 15,
      triggers: [
        {
          kind: "on-enter",
          damage: { type: "slashing" },
        },
      ],
      tacticalMetadata: null,
      narrativeDescriptor: "Lâminas espectrais.",
      speedMultiplier: null,
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 11 }),
    } as unknown as DiceService;
    const conditionLifecycle = {} as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Adult Blue Dragon",
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveEntry(
      target,
      { x: 16, y: 4 },
      "enc-1",
    );

    expect(dice.rollExpression).toHaveBeenCalledWith("4d4");
    expect(result.totalDamage).toBe(11);
    expect(result.events[0]).toMatchObject({
      event_type: "tile_effect_damage_applied",
      target_participant_id: "target-1",
      data: {
        effectKind: "cloud-of-daggers",
        triggerKind: "on-enter",
        expression: "4d4",
        type: "slashing",
        amount: 11,
      },
    });
  });

  it("applies Cloud of Daggers entry only once in the same turn", async () => {
    const persistedArea = {
      id: "area-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "cloud-of-daggers",
      effectKind: "cloud-of-daggers",
      shapeKind: "cube",
      originCell: { x: 16, y: 4 },
      radiusCells: 1,
      slotLevel: 2,
      triggers: [{ kind: "on-enter", damage: { type: "slashing" } }],
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 9 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Adult Blue Dragon",
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const first = await service.resolveEntry(
      target,
      { x: 16, y: 4 },
      "enc-1",
      undefined,
      "46:2",
    );
    const second = await service.resolveEntry(
      target,
      { x: 16, y: 4 },
      "enc-1",
      undefined,
      "46:2",
    );

    expect(first.totalDamage).toBe(9);
    expect(second.totalDamage).toBe(0);
    expect(dice.rollExpression).toHaveBeenCalledTimes(1);
  });

  it("does not treat movement within the same persistent area as a new entry", async () => {
    const persistedArea = {
      id: "area-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "web",
      effectKind: "web",
      shapeKind: "cube",
      originCell: { x: 10, y: 10 },
      radiusCells: 4,
      slotLevel: 2,
      saveDc: 15,
      triggers: [{ kind: "on-enter", save: { ability: "dex", dc: 15 } }],
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      rollD20: jest.fn().mockReturnValue({ roll: 1, total: 1 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Adult Red Dragon",
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveEntry(
      target,
      { x: 10, y: 11 },
      "enc-1",
      undefined,
      "48:1",
      { x: 10, y: 10 },
    );

    expect(result.events).toEqual([]);
    expect(dice.rollD20).not.toHaveBeenCalled();
  });

  it("still resolves entry when movement crosses from outside into an area", async () => {
    const persistedArea = {
      id: "area-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "cloud-of-daggers",
      effectKind: "cloud-of-daggers",
      shapeKind: "cube",
      originCell: { x: 10, y: 10 },
      radiusCells: 1,
      slotLevel: 2,
      triggers: [{ kind: "on-enter", damage: { type: "slashing" } }],
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 7 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Adult Blue Dragon",
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveEntry(
      target,
      { x: 10, y: 10 },
      "enc-1",
      undefined,
      "48:2",
      { x: 8, y: 10 },
    );

    expect(result.totalDamage).toBe(7);
    expect(dice.rollExpression).toHaveBeenCalledTimes(1);
  });

  it("uses the 2024 end-of-turn trigger and gates it against same-turn entry", async () => {
    const persistedArea = {
      id: "area-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "cloud-of-daggers",
      effectKind: "cloud-of-daggers",
      shapeKind: "cube",
      originCell: { x: 16, y: 4 },
      radiusCells: 1,
      slotLevel: 2,
      triggers: [{ kind: "on-start-turn-in", damage: { type: "slashing" } }],
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      rollExpression: jest.fn().mockReturnValue({ total: 8 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Adult Blue Dragon",
      isDefeated: false,
      positionX: 16,
      positionY: 4,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const entry = await service.resolveEntry(
      target,
      { x: 16, y: 4 },
      "enc-1",
      undefined,
      "47:0",
    );
    const sameTurnEnd = await service.resolveEndTurnIn(
      target,
      undefined,
      "47:0",
    );
    const nextTurnEnd = await service.resolveEndTurnIn(
      target,
      undefined,
      "47:1",
    );

    expect(entry.totalDamage).toBe(8);
    expect(sameTurnEnd.totalDamage).toBe(0);
    expect(nextTurnEnd.totalDamage).toBe(8);
    expect(nextTurnEnd.events[0]?.data.triggerKind).toBe("on-end-turn-in");
  });

  it("ends concentration when Sleet Storm's fused DEX save fails", async () => {
    const persistedArea = {
      id: "sleet-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "sleet-storm",
      effectKind: "sleet-storm",
      shapeKind: "cylinder",
      originCell: { x: 10, y: 10 },
      radiusCells: 4,
      slotLevel: 3,
      saveDc: 15,
      durationRoundsRemaining: 10,
      sourceConcentration: true,
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(1),
    } as unknown as DiceService;
    const conditionLifecycle = {
      applyCondition: jest.fn().mockResolvedValue({
        events: [],
        instance: { id: "prone-1", slug: "prone" },
        concentrationBroken: false,
      }),
      breakConcentration: jest.fn().mockResolvedValue([
        {
          event_type: "concentration_lost",
          target_participant_id: "target-1",
          data: { reason: "sleet_storm_failed_save" },
        },
      ]),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Concentrating target",
      positionX: 10,
      positionY: 10,
      isDefeated: false,
      isConcentrating: true,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveStartTurnIn(
      target,
      async () => ({
        modifier: 0,
        advantage: false,
        disadvantage: false,
        autoFail: false,
      }),
    );

    expect(conditionLifecycle.breakConcentration).toHaveBeenCalledWith(
      target,
      "sleet_storm_failed_save",
    );
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        slug: "prone",
        sourceConcentration: false,
        durationRoundsRemaining: null,
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "concentration_lost",
        data: expect.objectContaining({
          reason: "sleet_storm_failed_save",
        }),
      }),
    );
  });

  it("does not announce a persistent-area condition when immunity blocks it", async () => {
    const persistedArea = {
      id: "web-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "web",
      effectKind: "web",
      shapeKind: "cube",
      originCell: { x: 10, y: 10 },
      radiusCells: 4,
      slotLevel: 2,
      saveDc: 15,
      durationRoundsRemaining: 600,
      sourceConcentration: true,
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([persistedArea]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(1),
    } as unknown as DiceService;
    const conditionLifecycle = {
      applyCondition: jest.fn().mockResolvedValue({
        events: [
          {
            event_type: "condition_blocked_by_immunity",
            target_participant_id: "target-1",
            data: {
              slug: "restrained",
              source: "freedom-of-movement",
              feature: "Freedom of Movement",
            },
          },
        ],
        instance: {
          id: "blocked-restrained",
          slug: "restrained",
          durationRoundsRemaining: 0,
        },
        concentrationBroken: false,
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Freedom target",
      positionX: 10,
      positionY: 10,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [
        {
          slug: "freedom-of-movement",
          isMagical: true,
          durationRoundsRemaining: 600,
        },
      ],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveStartTurnIn(
      target,
      async () => ({ modifier: 1 }),
      "7:0",
    );

    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        slug: "restrained",
        sourceSpell: "web",
      }),
    );
    expect(result.conditionsApplied).toEqual([]);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_blocked_by_immunity",
      }),
    );
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_condition_applied",
      }),
    );
  });

  it("does not stop entry when immunity blocks a magical restraint", async () => {
    const area = {
      id: "elemental-freedom-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      shapeKind: "cube",
      originCell: { x: 5, y: 5 },
      radiusCells: 4,
      slotLevel: 5,
      saveDc: 17,
      damageType: "force",
      durationRoundsRemaining: 100,
      sourceConcentration: true,
      speedMultiplier: 0,
      tacticalMetadata: {
        tags: ["damage", "control", "restrained"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        casterFaction: "enemy",
        restrainedTargetId: null,
      },
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(1),
      rollExpression: jest.fn().mockReturnValue({ total: 12 }),
    } as unknown as DiceService;
    const conditionLifecycle = {
      applyCondition: jest.fn().mockResolvedValue({
        events: [
          {
            event_type: "condition_blocked_by_immunity",
            target_participant_id: "target-1",
            data: {
              slug: "restrained",
              source: "freedom-of-movement",
              feature: "Freedom of Movement",
            },
          },
        ],
        instance: {
          id: "blocked-restrained",
          slug: "restrained",
          durationRoundsRemaining: 0,
        },
        concentrationBroken: false,
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Freedom target",
      faction: "ally",
      positionX: 4,
      positionY: 6,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveEntry(
      target,
      { x: 6, y: 6 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "8:0",
      { x: 4, y: 6 },
    );

    expect(result.conditionsApplied).toEqual([]);
    expect(result.stopMovement).toBe(false);
    expect(area.tacticalMetadata?.restrainedTargetId).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_save_rolled",
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_blocked_by_immunity",
      }),
    );
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_condition_applied",
      }),
    );
    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_movement_stopped",
      }),
    );
  });

  it("applies Conjure Animals when the moving pack newly reaches a creature", async () => {
    const area = {
      id: "animals-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-animals",
      effectKind: "conjure-animals",
      shapeKind: "cube",
      originCell: { x: 9, y: 5 },
      radiusCells: 6,
      slotLevel: 3,
      saveDc: 15,
    } as unknown as PersistentAreaEffectEntity;
    const dice = {
      roll: jest.fn().mockReturnValue(4),
      rollExpression: jest.fn().mockReturnValue({ total: 18 }),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      {} as Repository<PersistentAreaEffectEntity>,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Alvo",
      positionX: 11,
      positionY: 5,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveAreaMovedInto(
      area,
      [target],
      { x: 3, y: 5 },
      async () => ({ modifier: 1 }),
      "12:0",
    );

    expect(result.totalDamage).toBe(18);
    expect(dice.rollExpression).toHaveBeenCalledWith("3d10");
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_save_rolled",
          target_participant_id: "target-1",
          data: expect.objectContaining({
            triggerKind: "on-area-moved-into",
            ability: "dex",
            dc: 15,
            passed: false,
          }),
        }),
        expect.objectContaining({
          event_type: "tile_effect_damage_applied",
          target_participant_id: "target-1",
          data: expect.objectContaining({
            triggerKind: "on-area-moved-into",
            expression: "3d10",
            type: "slashing",
            amount: 18,
          }),
        }),
      ]),
    );
  });

  it("does not retrigger Conjure Animals for a creature already inside the pack envelope", async () => {
    const area = {
      id: "animals-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-animals",
      effectKind: "conjure-animals",
      shapeKind: "cube",
      originCell: { x: 6, y: 5 },
      radiusCells: 6,
      slotLevel: 5,
      saveDc: 16,
    } as unknown as PersistentAreaEffectEntity;
    const dice = {
      roll: jest.fn(),
      rollExpression: jest.fn(),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      {} as Repository<PersistentAreaEffectEntity>,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = {
      id: "target-1",
      positionX: 7,
      positionY: 5,
      isDefeated: false,
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveAreaMovedInto(
      area,
      [target],
      { x: 5, y: 5 },
      undefined,
      "12:0",
    );

    expect(result.totalDamage).toBe(0);
    expect(result.events).toEqual([]);
    expect(dice.roll).not.toHaveBeenCalled();
    expect(dice.rollExpression).not.toHaveBeenCalled();
  });

  it("does not force allies through Conjure Animals optional hostile targeting", async () => {
    const area = {
      id: "animals-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-animals",
      effectKind: "conjure-animals",
      shapeKind: "cube",
      originCell: { x: 9, y: 5 },
      radiusCells: 6,
      slotLevel: 3,
      saveDc: 15,
      tacticalMetadata: {
        tags: ["damage"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        casterFaction: "ally",
      },
    } as unknown as PersistentAreaEffectEntity;
    const dice = {
      roll: jest.fn(),
      rollExpression: jest.fn(),
    } as unknown as DiceService;
    const service = new PersistentAreaService(
      {} as Repository<PersistentAreaEffectEntity>,
      dice,
      {} as ConditionLifecycleService,
    );
    const ally = {
      id: "ally-1",
      faction: "ally",
      positionX: 11,
      positionY: 5,
      isDefeated: false,
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveAreaMovedInto(
      area,
      [ally],
      { x: 3, y: 5 },
      undefined,
      "13:0",
    );

    expect(result.events).toEqual([]);
    expect(result.totalDamage).toBe(0);
    expect(dice.roll).not.toHaveBeenCalled();
    expect(dice.rollExpression).not.toHaveBeenCalled();
  });

  it("triggers Conjure Elemental only when a creature enters its Large core", async () => {
    const area = {
      id: "elemental-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      shapeKind: "cube",
      originCell: { x: 5, y: 5 },
      radiusCells: 4,
      slotLevel: 5,
      saveDc: 17,
      damageType: "fire",
      durationRoundsRemaining: 100,
      sourceConcentration: true,
      tacticalMetadata: {
        tags: ["damage", "control", "restrained"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        casterFaction: "ally",
        restrainedTargetId: null,
      },
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(4),
      rollExpression: jest.fn().mockReturnValue({ total: 36 }),
    } as unknown as DiceService;
    const conditionLifecycle = {
      applyCondition: jest.fn(async (target, input) => {
        target.conditionInstances = [
          ...(target.conditionInstances ?? []),
          {
            id: "restrained-1",
            slug: input.slug,
            appliedBy: input.appliedBy,
            sourceSpell: input.sourceSpell,
          },
        ];
        target.conditions = ["restrained"];
        return {
          events: [
            {
              event_type: "condition_applied",
              target_participant_id: target.id,
              data: { slug: input.slug },
            },
          ],
        };
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      displayName: "Alvo",
      faction: "enemy",
      positionX: 3,
      positionY: 5,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const adjacentOnly = await service.resolveEntry(
      target,
      { x: 4, y: 5 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "20:1",
      { x: 3, y: 5 },
    );
    expect(adjacentOnly.events).toEqual([]);

    const enteredCore = await service.resolveEntry(
      target,
      { x: 6, y: 6 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "20:1",
      { x: 4, y: 6 },
    );

    expect(enteredCore.totalDamage).toBe(36);
    expect(enteredCore.stopMovement).toBe(true);
    expect(enteredCore.conditionsApplied).toEqual([
      { targetId: "target-1", slug: "restrained" },
    ]);
    expect(enteredCore.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_damage_applied",
          data: expect.objectContaining({
            triggerKind: "on-enter",
            expression: "8d8",
            type: "fire",
            amount: 36,
          }),
        }),
        expect.objectContaining({
          event_type: "tile_effect_movement_stopped",
        }),
      ]),
    );
    expect(area.tacticalMetadata?.restrainedTargetId).toBe("target-1");
  });

  it("does not affect a second creature while Conjure Elemental restrains one", async () => {
    const area = {
      id: "elemental-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      shapeKind: "cube",
      originCell: { x: 5, y: 5 },
      radiusCells: 4,
      slotLevel: 5,
      saveDc: 17,
      damageType: "cold",
      tacticalMetadata: {
        tags: ["damage", "control"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        targeting: "hostile_only",
        casterFaction: "ally",
        restrainedTargetId: "target-1",
      },
    } as unknown as PersistentAreaEffectEntity;
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
    const secondTarget = {
      id: "target-2",
      encounterId: "enc-1",
      faction: "enemy",
      positionX: 4,
      positionY: 5,
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveStartTurnIn(secondTarget);

    expect(result.events).toEqual([]);
    expect(result.totalDamage).toBe(0);
    expect(dice.roll).not.toHaveBeenCalled();
  });

  it("deals the lower repeat damage when Conjure Elemental's target fails again", async () => {
    const area = {
      id: "elemental-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      shapeKind: "cube",
      originCell: { x: 5, y: 5 },
      radiusCells: 4,
      slotLevel: 5,
      saveDc: 17,
      damageType: "lightning",
      tacticalMetadata: {
        tags: ["damage", "control"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        restrainedTargetId: "target-1",
      },
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(3),
      rollExpression: jest.fn().mockReturnValue({ total: 19 }),
    } as unknown as DiceService;
    const conditionLifecycle = {
      removeConditionInstance: jest.fn(),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      faction: "enemy",
      positionX: 19,
      positionY: 19,
      isDefeated: false,
      conditions: ["restrained"],
      conditionInstances: [
        {
          id: "restrained-1",
          slug: "restrained",
          appliedBy: "caster-1",
          sourceSpell: "conjure-elemental",
        },
      ],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveStartTurnIn(
      target,
      async () => ({ modifier: 2 }),
    );

    expect(result.totalDamage).toBe(19);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "tile_effect_damage_applied",
        data: expect.objectContaining({
          triggerKind: "on-restrained-start-turn",
          expression: "4d8",
          type: "lightning",
          amount: 19,
        }),
      }),
    );
    expect(conditionLifecycle.removeConditionInstance).not.toHaveBeenCalled();
  });

  it("releases Conjure Elemental's target after a successful repeated save", async () => {
    const area = {
      id: "elemental-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      shapeKind: "cube",
      originCell: { x: 5, y: 5 },
      radiusCells: 4,
      slotLevel: 5,
      saveDc: 17,
      damageType: "thunder",
      tacticalMetadata: {
        tags: ["damage", "control"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        restrainedTargetId: "target-1",
      },
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = {
      roll: jest.fn().mockReturnValue(18),
      rollExpression: jest.fn().mockReturnValue({ total: 22 }),
    } as unknown as DiceService;
    const conditionLifecycle = {
      removeConditionInstance: jest.fn().mockResolvedValue({
        removed: true,
        events: [
          {
            event_type: "condition_removed",
            target_participant_id: "target-1",
            data: { slug: "restrained", removalReason: "target_saved" },
          },
        ],
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      faction: "enemy",
      positionX: 19,
      positionY: 19,
      isDefeated: false,
      conditions: ["restrained"],
      conditionInstances: [
        {
          id: "restrained-1",
          slug: "restrained",
          appliedBy: "caster-1",
          sourceSpell: "conjure-elemental",
        },
      ],
      effectInstances: [],
    } as unknown as EncounterParticipantEntity;

    const result = await service.resolveStartTurnIn(
      target,
      async () => ({ modifier: 1 }),
    );

    expect(result.totalDamage).toBe(0);
    expect(conditionLifecycle.removeConditionInstance).toHaveBeenCalledWith(
      target,
      "restrained-1",
      "target_saved",
    );
    expect(area.tacticalMetadata?.restrainedTargetId).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
      }),
    );
  });

  it("releases Conjure Elemental's target when that creature is defeated", async () => {
    const area = {
      id: "elemental-1",
      encounterId: "enc-1",
      casterParticipantId: "caster-1",
      sourceSpell: "conjure-elemental",
      effectKind: "conjure-elemental",
      tacticalMetadata: {
        tags: ["damage", "control", "restrained"],
        tacticalValue: 9,
        beneficiaryFaction: "caster",
        restrainedTargetId: "target-1",
      },
    } as unknown as PersistentAreaEffectEntity;
    const areaRepo = {
      find: jest.fn().mockResolvedValue([area]),
      save: jest.fn(async (value) => value),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const conditionLifecycle = {
      removeConditionInstance: jest.fn().mockResolvedValue({
        removed: true,
        events: [
          {
            event_type: "condition_removed",
            target_participant_id: "target-1",
            data: {
              slug: "restrained",
              removalReason: "target_defeated",
            },
          },
        ],
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      {} as DiceService,
      conditionLifecycle,
    );
    const target = {
      id: "target-1",
      encounterId: "enc-1",
      isDefeated: true,
      conditions: ["restrained"],
      conditionInstances: [
        {
          id: "restrained-1",
          slug: "restrained",
          appliedBy: "caster-1",
          sourceSpell: "conjure-elemental",
        },
      ],
    } as unknown as EncounterParticipantEntity;

    const result = await service.releaseConjureElementalTarget(target);

    expect(conditionLifecycle.removeConditionInstance).toHaveBeenCalledWith(
      target,
      "restrained-1",
      "target_defeated",
    );
    expect(area.tacticalMetadata?.restrainedTargetId).toBeNull();
    expect(areaRepo.save).toHaveBeenCalledWith(area);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "condition_removed",
        }),
        expect.objectContaining({
          event_type: "tile_effect_target_released",
          target_participant_id: "target-1",
          data: expect.objectContaining({
            reason: "target_defeated",
          }),
        }),
      ]),
    );
  });
});
