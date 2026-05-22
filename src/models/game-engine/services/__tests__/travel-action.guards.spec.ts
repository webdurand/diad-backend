import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
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

function makeService() {
  const sessionRepo = makeRepo();
  const stateRepo = makeRepo();
  const equipmentRepo = makeRepo();
  const classRepo = makeRepo();
  const connectionRepo = makeRepo();
  const contextCache = { invalidateAll: jest.fn() };
  const dice = { roll: jest.fn(() => 10) };
  const eventBus = { publish: jest.fn() };
  const envelopeFactory = { build: jest.fn((input) => input) };
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
  };
}

describe("TravelActionService guards", () => {
  it("rejeita ação sem viagem ativa como error envelope, não outcome", async () => {
    const { service, sessionRepo } = makeService();
    sessionRepo.findOne.mockResolvedValue({
      id: "session-1",
      config: { hubPoiEnabled: true },
      characterIds: ["char-1"],
      travelState: null,
    });

    await expect(
      service.apply("session-1", { kind: "hasten" }),
    ).rejects.toMatchObject({
      code: ErrorCode.TRAVEL_ACTION_NO_ACTIVE_TRAVEL,
    });
  });

  it("bloqueia hasten em exhaustion 5 antes do death-step RAW 1-6", async () => {
    const { service, sessionRepo, stateRepo } = makeService();
    sessionRepo.findOne.mockResolvedValue({
      id: "session-1",
      config: { hubPoiEnabled: true },
      characterIds: ["char-1"],
      travelState: makeTravel(),
    });
    stateRepo.findOne.mockResolvedValue({
      character_id: "char-1",
      exhaustion_level: 5,
      hit_dice_used: {},
    });

    await expect(
      service.apply("session-1", { kind: "hasten" }),
    ).rejects.toMatchObject({
      code: ErrorCode.TRAVEL_ACTION_EXHAUSTION_CAP,
    });
  });

  it("bloqueia long rest fora de área segura como guarda DIAD", async () => {
    const { service, sessionRepo, stateRepo } = makeService();
    sessionRepo.findOne.mockResolvedValue({
      id: "session-1",
      config: { hubPoiEnabled: true },
      characterIds: ["char-1"],
      travelState: makeTravel({ destinationBiome: "wilderness" }),
    });
    stateRepo.findOne.mockResolvedValue({
      character_id: "char-1",
      exhaustion_level: 1,
      hit_dice_used: {},
    });

    await expect(
      service.apply("session-1", { kind: "camp", restType: "long" }),
    ).rejects.toMatchObject({
      code: ErrorCode.TRAVEL_ACTION_UNSAFE_LONG_REST,
    });
  });

  it("rejeita reroute para rota inexistente", async () => {
    const { service, sessionRepo, connectionRepo } = makeService();
    sessionRepo.findOne.mockResolvedValue({
      id: "session-1",
      config: { hubPoiEnabled: true },
      characterIds: ["char-1"],
      travelState: makeTravel(),
    });
    connectionRepo.findOne.mockResolvedValue(null);

    await expect(
      service.apply("session-1", {
        kind: "reroute",
        alternativeLocationId: "loc-c",
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.TRAVEL_ACTION_INVALID_REROUTE,
    });
  });
});
