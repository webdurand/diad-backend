import { TravelActionService } from "../travel-action.service";
import type { SessionTravelState } from "src/entities/game-session.entity";

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(async (value) => value),
  remove: jest.fn(async (value) => value),
});

function makeTravel(
  override?: Partial<SessionTravelState>,
): SessionTravelState {
  return {
    active: true,
    fromLocationId: "loc-a",
    toLocationId: "loc-b",
    toLocationName: "Bosque Velho",
    toLocationType: "wilderness",
    destinationBiome: "wilderness",
    connectionId: "conn-1",
    totalMinutes: 240,
    elapsedMinutes: 60,
    totalTurns: 4,
    elapsedTurns: 1,
    minutesPerTurn: 60,
    startedAtIso: "2026-05-22T00:00:00.000Z",
    reason: "shortcut",
    ...override,
  };
}

function makeService(travel = makeTravel()) {
  const sessionRepo = makeRepo();
  const stateRepo = makeRepo();
  const equipmentRepo = makeRepo();
  const classRepo = makeRepo();
  const connectionRepo = makeRepo();
  const contextCache = { invalidateAll: jest.fn() };
  const dice = { roll: jest.fn(() => 10) };
  const eventBus = { publish: jest.fn() };
  const envelopeFactory = { build: jest.fn((input) => input) };
  sessionRepo.findOne.mockResolvedValue({
    id: "session-1",
    config: { hubPoiEnabled: true },
    characterIds: ["char-1"],
    travelState: travel,
  });
  const service = new TravelActionService(
    sessionRepo as any,
    stateRepo as any,
    equipmentRepo as any,
    classRepo as any,
    connectionRepo as any,
    contextCache as any,
    dice as any,
    eventBus as any,
    envelopeFactory as any,
  );
  return {
    service,
    sessionRepo,
    stateRepo,
    equipmentRepo,
    classRepo,
    connectionRepo,
    contextCache,
    dice,
    eventBus,
    travel,
  };
}

describe("TravelActionService outcomes", () => {
  it("hasten consome ração, aplica exhaustion +1 e remove 1 turno", async () => {
    const { service, stateRepo, equipmentRepo, travel, eventBus } =
      makeService();
    const ration = {
      id: "item-1",
      character_id: "char-1",
      quantity: 2,
      equipment: { slug: "rations", name: "Rations" },
    };
    const state = {
      character_id: "char-1",
      exhaustion_level: 1,
      hit_dice_used: {},
    };
    stateRepo.findOne.mockResolvedValue(state);
    equipmentRepo.find.mockResolvedValue([ration]);

    const result = await service.apply("session-1", { kind: "hasten" });

    expect(ration.quantity).toBe(1);
    expect(state.exhaustion_level).toBe(2);
    expect(travel.totalTurns).toBe(3);
    expect(result.outcome).toMatchObject({
      kind: "hasten",
      hastenResult: "applied",
      newExhaustionLevel: 2,
    });
    expect(result.consequencesApplied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "rations_consumed", value: 1 }),
        expect.objectContaining({ type: "turn_removed", value: 1 }),
      ]),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "travel_action_applied" }),
    );
  });

  it("scout falho retorna outcome 200 e prepara +1 no encontro sem lançar erro", async () => {
    const { service, dice, travel } = makeService();
    dice.roll.mockReturnValue(1);

    const result = await service.apply("session-1", {
      kind: "scout",
      perceptionModifier: 0,
    });

    expect(result.outcome).toMatchObject({
      kind: "scout",
      scoutResult: "critical_fail",
      rollResult: 1,
    });
    expect((travel as any).encounterRollDeltaNextTurn).toBe(1);
  });

  it("long rest 2014 recupera max(1, floor(total_HD/2)) HD e reduz exhaustion", async () => {
    const { service, stateRepo, classRepo, travel } = makeService(
      makeTravel({ destinationBiome: "road" }),
    );
    const state = {
      character_id: "char-1",
      exhaustion_level: 2,
      hit_dice_used: { d8: 4 },
      spell_slots_used: { "1": 2 },
      feature_uses_used: { second_wind: 1 },
    };
    stateRepo.findOne.mockResolvedValue(state);
    classRepo.find.mockResolvedValue([
      { class_level: 5, class: { hit_die: 8 } },
    ]);

    const result = await service.apply("session-1", {
      kind: "camp",
      restType: "long",
      edition: "2014",
    });

    expect(state.exhaustion_level).toBe(1);
    expect(state.hit_dice_used).toEqual({ d8: 2 });
    expect(state.spell_slots_used).toEqual({});
    expect(travel.totalTurns).toBe(5);
    expect(result.outcome).toMatchObject({
      kind: "camp",
      campResult: "long_applied",
      hdRecovered: 2,
      newExhaustionLevel: 1,
    });
  });

  it("reroute troca destino e adiciona 1 turno de pacing", async () => {
    const { service, connectionRepo, travel } = makeService();
    connectionRepo.findOne.mockResolvedValue({
      id: "conn-2",
      fromLocationId: "loc-a",
      toLocationId: "loc-c",
      isLocked: false,
      isHidden: false,
      travelTime: "2h",
      toLocation: { id: "loc-c", name: "Ponte Antiga", type: "road" },
    });

    const result = await service.apply("session-1", {
      kind: "reroute",
      alternativeLocationId: "loc-c",
    });

    expect(travel.toLocationId).toBe("loc-c");
    expect(travel.toLocationName).toBe("Ponte Antiga");
    expect(travel.totalTurns).toBe(5);
    expect(result.outcome).toMatchObject({
      kind: "reroute",
      rerouteResult: "applied",
      newDestinationLocationId: "loc-c",
    });
  });
});
