import { TravelTickService } from "../travel-tick.service";

const makeLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const makeSession = (overrides: Partial<any> = {}): any => ({
  id: "sess-1",
  campaignId: "camp-1",
  activeEncounterId: null,
  travelState: null,
  ...overrides,
});

describe("TravelTickService.tick", () => {
  const newScene = { id: "scene-arrival" };

  const buildService = (deps: {
    session: any;
    encounter?: { id: string; status: string } | null;
  }) => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(deps.session),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    const encounterRepo = {
      findOne: jest.fn().mockResolvedValue(deps.encounter ?? null),
    };
    const sceneService = {
      create: jest.fn().mockResolvedValue(newScene),
      getActive: jest.fn().mockResolvedValue({ id: "scene-active" }),
    };
    const locationService = {
      markVisited: jest.fn().mockResolvedValue(undefined),
    };
    const gameClockService = {
      advanceTime: jest.fn().mockResolvedValue(undefined),
    };
    const contextCache = {
      invalidate: jest.fn(),
    };
    const service = new TravelTickService(
      sessionRepo as any,
      encounterRepo as any,
      sceneService as any,
      locationService as any,
      gameClockService as any,
      contextCache as any,
      makeLogger() as any,
    );
    return { service, sessionRepo, sceneService, locationService, gameClockService };
  };

  it("returns no_travel when session has no travelState", async () => {
    const { service } = buildService({ session: makeSession() });
    const result = await service.tick("sess-1");
    expect(result.status).toBe("no_travel");
  });

  it("returns paused_combat when active encounter exists", async () => {
    const session = makeSession({
      activeEncounterId: "enc-1",
      travelState: {
        active: true,
        elapsedTurns: 1,
        totalTurns: 3,
        minutesPerTurn: 60,
        toLocationId: "loc-2",
        toLocationName: "Florestas",
        toLocationType: "wilderness",
        destinationBiome: "wilderness",
        connectionId: "conn-1",
        fromLocationId: "loc-1",
        totalMinutes: 180,
        elapsedMinutes: 60,
        startedAtIso: "2026-01-01T00:00:00Z",
        reason: "player_movement",
      },
    });
    const { service } = buildService({
      session,
      encounter: { id: "enc-1", status: "active" },
    });
    const result = await service.tick("sess-1");
    expect(result.status).toBe("paused_combat");
    if (result.status === "paused_combat") {
      expect(result.travelState.elapsedTurns).toBe(1);
      expect(result.progressPercent).toBe(33);
    }
  });

  it("advances elapsed turns when no encounter", async () => {
    const session = makeSession({
      travelState: {
        active: true,
        elapsedTurns: 0,
        totalTurns: 2,
        minutesPerTurn: 120,
        toLocationId: "loc-2",
        toLocationName: "Florestas",
        toLocationType: "wilderness",
        destinationBiome: "wilderness",
        connectionId: "conn-1",
        fromLocationId: "loc-1",
        totalMinutes: 240,
        elapsedMinutes: 0,
        startedAtIso: "2026-01-01T00:00:00Z",
        reason: "player_movement",
      },
    });
    const { service, gameClockService } = buildService({ session });
    const result = await service.tick("sess-1");
    expect(result.status).toBe("in_transit");
    if (result.status === "in_transit") {
      expect(result.travelState.elapsedTurns).toBe(1);
      expect(result.progressPercent).toBe(50);
    }
    expect(gameClockService.advanceTime).toHaveBeenCalledWith("camp-1", {
      hours: 2,
      trigger: "travel_tick",
    });
  });

  it("returns ready_to_arrive on last tick (does NOT create scene)", async () => {
    const session = makeSession({
      travelState: {
        active: true,
        elapsedTurns: 1,
        totalTurns: 2,
        minutesPerTurn: 120,
        toLocationId: "loc-2",
        toLocationName: "Florestas",
        toLocationType: "wilderness",
        destinationBiome: "wilderness",
        connectionId: "conn-1",
        fromLocationId: "loc-1",
        totalMinutes: 240,
        elapsedMinutes: 120,
        startedAtIso: "2026-01-01T00:00:00Z",
        reason: "player_movement",
      },
    });
    const { service, sessionRepo, sceneService } = buildService({ session });
    const result = await service.tick("sess-1");
    expect(result.status).toBe("ready_to_arrive");
    if (result.status === "ready_to_arrive") {
      expect(result.progressPercent).toBe(100);
      expect(result.travelState.elapsedTurns).toBe(2);
    }
    expect(session.travelState).not.toBeNull();
    expect(sessionRepo.save).toHaveBeenCalled();
    expect(sceneService.create).not.toHaveBeenCalled();
  });

  it("subsequent ticks while ready_to_arrive stay at 100% (no further increment)", async () => {
    const session = makeSession({
      travelState: {
        active: true,
        elapsedTurns: 2,
        totalTurns: 2,
        minutesPerTurn: 120,
        toLocationId: "loc-2",
        toLocationName: "Florestas",
        toLocationType: "wilderness",
        destinationBiome: "wilderness",
        connectionId: "conn-1",
        fromLocationId: "loc-1",
        totalMinutes: 240,
        elapsedMinutes: 240,
        startedAtIso: "2026-01-01T00:00:00Z",
        reason: "player_movement",
      },
    });
    const { service, gameClockService } = buildService({ session });
    const result = await service.tick("sess-1");
    expect(result.status).toBe("ready_to_arrive");
    expect(gameClockService.advanceTime).not.toHaveBeenCalled();
    expect(session.travelState?.elapsedTurns).toBe(2);
  });

  it("arrive() creates destination scene + clears travelState", async () => {
    const session = makeSession({
      travelState: {
        active: true,
        elapsedTurns: 2,
        totalTurns: 2,
        minutesPerTurn: 120,
        toLocationId: "loc-2",
        toLocationName: "Florestas",
        toLocationType: "wilderness",
        destinationBiome: "wilderness",
        connectionId: "conn-1",
        fromLocationId: "loc-1",
        totalMinutes: 240,
        elapsedMinutes: 240,
        startedAtIso: "2026-01-01T00:00:00Z",
        reason: "player_movement",
      },
    });
    const { service, sessionRepo, sceneService, locationService } = buildService({ session });
    const result = await service.arrive("sess-1");
    expect(result.status).toBe("arrived");
    if (result.status === "arrived") {
      expect(result.sceneId).toBe(newScene.id);
      expect(result.toLocationId).toBe("loc-2");
      expect(result.fromLocationId).toBe("loc-1");
    }
    expect(session.travelState).toBeNull();
    expect(sessionRepo.save).toHaveBeenCalled();
    expect(sceneService.create).toHaveBeenCalledWith("sess-1", {
      locationId: "loc-2",
      title: "Florestas",
      reason: "travel_arrival",
      skipBudgetIncrement: true,
    });
    expect(locationService.markVisited).toHaveBeenCalledWith("loc-2");
  });

  it("arrive() returns no_travel when no active travel", async () => {
    const { service, sceneService } = buildService({ session: makeSession() });
    const result = await service.arrive("sess-1");
    expect(result.status).toBe("no_travel");
    expect(sceneService.create).not.toHaveBeenCalled();
  });
});
