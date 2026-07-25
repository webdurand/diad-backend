import type { Repository } from "typeorm";
import type { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { DiceService } from "./dice.service";
import type { ConditionLifecycleService } from "./condition-lifecycle.service";
import { PersistentAreaService } from "./persistent-area.service";

const zone = {
  id: "zone-1",
  encounterId: "enc-1",
  casterParticipantId: "caster-1",
  sourceSpell: "zone-of-truth",
  effectKind: "zone-of-truth",
  shapeKind: "sphere",
  originCell: { x: 5, y: 5 },
  radiusCells: 3,
  slotLevel: 2,
  saveDc: 15,
  durationRoundsRemaining: 100,
  sourceConcentration: false,
} as unknown as PersistentAreaEffectEntity;

function participant(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: "target-1",
    encounterId: "enc-1",
    displayName: "Alvo",
    positionX: 5,
    positionY: 5,
    isDefeated: false,
    conditions: [],
    conditionInstances: [],
    effectInstances: [],
    ...overrides,
  } as EncounterParticipantEntity;
}

describe("PersistentAreaService Zone of Truth", () => {
  it("applies a visible truth binding after a failed entry save", async () => {
    const areaRepo = {
      find: jest.fn().mockResolvedValue([zone]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = { roll: jest.fn().mockReturnValue(4) } as unknown as DiceService;
    const conditionLifecycle = {
      applyCondition: jest.fn().mockResolvedValue({
        events: [{ event_type: "condition_applied" }],
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      conditionLifecycle,
    );
    const target = participant();

    const result = await service.resolveEntry(
      target,
      { x: 5, y: 5 },
      "enc-1",
      async () => ({ modifier: 1 }),
      "3:1",
      { x: 1, y: 1 },
    );

    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        slug: "truth_bound",
        appliedBy: "caster-1",
        sourceSpell: "zone-of-truth",
        sourceConcentration: false,
        saveAbility: "cha",
        saveDc: 15,
        repeatSaveTiming: "never",
        durationRoundsRemaining: 100,
      }),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "tile_effect_save_rolled",
          data: expect.objectContaining({
            triggerKind: "on-enter",
            ability: "cha",
            passed: false,
          }),
        }),
        expect.objectContaining({
          event_type: "tile_effect_condition_applied",
          data: expect.objectContaining({ conditionSlug: "truth_bound" }),
        }),
      ]),
    );
  });

  it("does not ask for another save after the creature is truth-bound", async () => {
    const areaRepo = {
      find: jest.fn().mockResolvedValue([zone]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const dice = { roll: jest.fn() } as unknown as DiceService;
    const service = new PersistentAreaService(
      areaRepo,
      dice,
      {} as ConditionLifecycleService,
    );
    const target = participant({
      conditionInstances: [
        {
          id: "truth-1",
          slug: "truth_bound",
          appliedBy: "caster-1",
          sourceSpell: "zone-of-truth",
        },
      ] as EncounterParticipantEntity["conditionInstances"],
    });

    const result = await service.resolveStartTurnIn(
      target,
      async () => ({ modifier: 2 }),
    );

    expect(result.events).toEqual([]);
    expect(dice.roll).not.toHaveBeenCalled();
  });

  it("removes the binding when the creature leaves every zone from that caster", async () => {
    const areaRepo = {
      find: jest.fn().mockResolvedValue([zone]),
    } as unknown as Repository<PersistentAreaEffectEntity>;
    const conditionLifecycle = {
      removeConditionInstance: jest.fn().mockResolvedValue({
        removed: true,
        events: [
          {
            event_type: "condition_removed",
            target_participant_id: "target-1",
            data: { slug: "truth_bound", removalReason: "left_area" },
          },
        ],
      }),
    } as unknown as ConditionLifecycleService;
    const service = new PersistentAreaService(
      areaRepo,
      {} as DiceService,
      conditionLifecycle,
    );
    const target = participant({
      conditionInstances: [
        {
          id: "truth-1",
          slug: "truth_bound",
          appliedBy: "caster-1",
          sourceSpell: "zone-of-truth",
        },
      ] as EncounterParticipantEntity["conditionInstances"],
    });

    const events = await service.removeLocationBoundConditionsOutsideAreas(
      target,
      { x: 12, y: 12 },
    );

    expect(conditionLifecycle.removeConditionInstance).toHaveBeenCalledWith(
      target,
      "truth-1",
      "left_area",
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: "condition_removed" }),
    ]);
  });
});
