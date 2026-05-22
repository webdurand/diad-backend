import { MoveToLocationService } from "../move-to-location.service";

const makeLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeService(overrides: Record<string, any> = {}): MoveToLocationService {
  return new MoveToLocationService(
    overrides.sessionRepo as any,
    overrides.connectionRepo as any,
    (overrides.arcStateRepo ?? { findOne: jest.fn().mockResolvedValue({ currentPhaseIndex: 1 }) }) as any,
    (overrides.locationService ?? {}) as any,
    overrides.sceneService as any,
    (overrides.eventBus ?? { publish: jest.fn() }) as any,
    (overrides.envelopeFactory ?? { build: jest.fn((value) => value) }) as any,
    (overrides.contextCache ?? { invalidate: jest.fn() }) as any,
    (overrides.movementLockService ?? { getActiveForSession: jest.fn().mockResolvedValue(null) }) as any,
    (overrides.logger ?? makeLogger()) as any,
  );
}

describe("MoveToLocationService.listReachableLocations", () => {
  it("retorna destinos conhecidos com travelHours, label, riscos e lock", async () => {
    const connectionRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "conn-1",
          toLocationId: "loc-2",
          toLocation: { id: "loc-2", name: "Ilha do Diabo", type: "coastal" },
          travelTime: "3",
          description: "Brisa cortante. Patrulhas do Capuz.",
          isAccessibleAtPhase: jest.fn().mockReturnValue(true),
        },
        {
          id: "conn-2",
          toLocationId: "loc-3",
          toLocation: { id: "loc-3", name: "Farol Velado", type: "supernatural" },
          travelTime: "25",
          description: null,
          unlockedAtPhase: 2,
          requirements: { phase: 2 },
          isAccessibleAtPhase: jest.fn().mockReturnValue(false),
        },
      ]),
    };
    const service = makeService({
      sessionRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "session-1",
          campaignId: "campaign-1",
        }),
      },
      connectionRepo,
      sceneService: {
        getActive: jest.fn().mockResolvedValue({
          id: "scene-1",
          locationId: "loc-1",
        }),
      },
    });

    const result = await service.listReachableLocations("session-1");

    expect(connectionRepo.find).toHaveBeenCalledWith({
      where: { fromLocationId: "loc-1", isHidden: false },
      relations: ["toLocation"],
    });
    expect(result).toEqual({
      currentLocationId: "loc-1",
      locations: [
        expect.objectContaining({
          id: "loc-2",
          name: "Ilha do Diabo",
          travelHours: 3,
          travelLabel: "3h",
          biome: "coastal",
          knownDangers: ["Brisa cortante", "Patrulhas do Capuz"],
          riskLevel: "alto",
          isLocked: false,
        }),
        expect.objectContaining({
          id: "loc-3",
          name: "Farol Velado",
          travelHours: 1,
          travelLabel: "1h",
          biome: "supernatural",
          knownDangers: [],
          riskLevel: "desconhecido",
          isLocked: true,
          lockReason: "Caminho bloqueado nesta fase.",
        }),
      ],
    });
  });
});
