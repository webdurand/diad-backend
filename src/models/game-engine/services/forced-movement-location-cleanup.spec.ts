import { CombatService } from "./combat.service";
import { SpellCastingService } from "./spell-casting.service";
import type { EncounterEntity } from "src/entities/encounter.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { GameEventData } from "../interfaces/result.type";

const removedTruthEvent: GameEventData = {
  event_type: "condition_removed",
  target_participant_id: "target-1",
  data: {
    slug: "truth_bound",
    removalReason: "left_area",
  },
};

function participant(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: "target-1",
    encounterId: "enc-1",
    displayName: "Alvo",
    positionX: 7,
    positionY: 5,
    isDefeated: false,
    conditions: ["truth_bound"],
    conditionInstances: [
      {
        id: "truth-1",
        slug: "truth_bound",
        appliedBy: "caster-1",
        sourceSpell: "zone-of-truth",
      },
    ],
    effectInstances: [],
    ...overrides,
  } as EncounterParticipantEntity;
}

function cleanupPersistentArea() {
  return {
    removeLocationBoundConditionsOutsideAreas: jest.fn(
      async (target: EncounterParticipantEntity) => {
        target.conditions = [];
        target.conditionInstances = [];
        return [removedTruthEvent];
      },
    ),
    relocateAurasByCaster: jest.fn().mockResolvedValue({
      events: [],
      totalDamage: 0,
      conditionsApplied: [],
      stopMovement: false,
    }),
  };
}

describe("forced movement location-bound condition cleanup", () => {
  it("preserva condition_removed no deslocamento de Thunderwave", async () => {
    const caster = participant({
      id: "caster-1",
      positionX: 6,
      positionY: 5,
      conditions: [],
      conditionInstances: [],
    });
    const target = participant();
    const persistedTarget = participant();
    const persistentArea = cleanupPersistentArea();
    const participantRepo = {
      find: jest.fn().mockResolvedValue([caster, target]),
      update: jest.fn(
        async (
          _id: string,
          coordinates: Partial<EncounterParticipantEntity>,
        ) => {
          Object.assign(persistedTarget, coordinates);
        },
      ),
      findOne: jest.fn().mockResolvedValue(persistedTarget),
    };
    const service = Object.create(SpellCastingService.prototype) as {
      participantRepo: typeof participantRepo;
      persistentArea: typeof persistentArea;
      pushTargetAwayFromCaster: (
        encounter: EncounterEntity,
        source: EncounterParticipantEntity,
        pushed: EncounterParticipantEntity,
        distanceFt: number,
        events: GameEventData[],
      ) => Promise<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        distanceFt: number;
      } | null>;
    };
    service.participantRepo = participantRepo;
    service.persistentArea = persistentArea;
    const events: GameEventData[] = [];

    const movement = await service.pushTargetAwayFromCaster(
      {
        id: "enc-1",
        mapData: { gridColumns: 20, gridRows: 20 },
      } as EncounterEntity,
      caster,
      target,
      10,
      events,
    );

    expect(movement).toEqual({
      from: { x: 7, y: 5 },
      to: { x: 9, y: 5 },
      distanceFt: 10,
    });
    expect(
      persistentArea.removeLocationBoundConditionsOutsideAreas,
    ).toHaveBeenCalledWith(persistedTarget, { x: 9, y: 5 });
    expect(target.conditions).toEqual([]);
    expect(target.conditionInstances).toEqual([]);
    expect(events).toContainEqual(removedTruthEvent);
  });

  it("preserva condition_removed no arremesso de Whirlwind", async () => {
    const target = participant();
    const persistedTarget = participant();
    const persistentArea = cleanupPersistentArea();
    const participantRepo = {
      find: jest.fn().mockResolvedValue([target]),
      update: jest.fn(
        async (
          _id: string,
          coordinates: Partial<EncounterParticipantEntity>,
        ) => {
          Object.assign(persistedTarget, coordinates);
        },
      ),
      findOne: jest.fn().mockResolvedValue(persistedTarget),
    };
    const service = Object.create(CombatService.prototype) as {
      diceService: { roll: (sides: number) => number };
      participantRepo: typeof participantRepo;
      persistentArea: typeof persistentArea;
      throwTargetInRandomDirection: (
        encounter: EncounterEntity,
        pushed: EncounterParticipantEntity,
        maximumDistanceFt: number,
        events: GameEventData[],
      ) => Promise<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        distanceFt: number;
      } | undefined>;
    };
    service.diceService = { roll: () => 3 };
    service.participantRepo = participantRepo;
    service.persistentArea = persistentArea;
    const events: GameEventData[] = [];

    const movement = await service.throwTargetInRandomDirection(
      {
        id: "enc-1",
        mapData: { gridColumns: 20, gridRows: 20 },
      } as EncounterEntity,
      target,
      20,
      events,
    );

    expect(movement).toEqual({
      from: { x: 7, y: 5 },
      to: { x: 11, y: 5 },
      distanceFt: 20,
    });
    expect(
      persistentArea.removeLocationBoundConditionsOutsideAreas,
    ).toHaveBeenCalledWith(persistedTarget, { x: 11, y: 5 });
    expect(target.conditions).toEqual([]);
    expect(target.conditionInstances).toEqual([]);
    expect(events).toContainEqual(removedTruthEvent);
  });
});
