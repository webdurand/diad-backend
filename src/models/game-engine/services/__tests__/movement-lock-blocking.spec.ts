import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { MoveToLocationService } from "../move-to-location.service";
import { MoveToPoiService } from "../move-to-poi.service";

const makeLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const activeLock = {
  sceneId: "scene-1",
  locationId: "loc-1",
  poiId: "poi-1",
  movementLock: {
    active: true,
    reason: "Você está preso nesta conversa.",
    exitActionLabel: "Encerrar conversa",
    source: "director",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

const makeMovementLockService = () => ({
  getActiveForSession: jest.fn().mockResolvedValue(activeLock),
  buildBlockedMessage: jest
    .fn()
    .mockReturnValue(
      "Você está preso nesta conversa; encerre a interação antes de se deslocar.",
    ),
});

describe("movement lock blocking", () => {
  it("blocks move-to-location while active", async () => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "sess-1",
        campaignId: "camp-1",
        travelState: null,
      }),
    };
    const movementLockService = makeMovementLockService();
    const service = new MoveToLocationService(
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      movementLockService as any,
      makeLogger() as any,
    );

    await expect(
      service.run({ sessionId: "sess-1", targetLocationId: "loc-2" }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_INVALID_PAYLOAD,
      context: expect.objectContaining({ reason: "movement_lock" }),
    });
  });

  it("returns blocked from travel/resolve while active", async () => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "sess-1",
        campaignId: "camp-1",
        travelState: null,
      }),
    };
    const movementLockService = makeMovementLockService();
    const service = new MoveToLocationService(
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      movementLockService as any,
      makeLogger() as any,
    );

    const result = await service.resolveTravel({
      sessionId: "sess-1",
      targetLocationName: "Praia",
    });

    expect(result).toMatchObject({
      status: "blocked",
      fromLocationId: "loc-1",
      reason: "movement_lock",
    });
  });

  it("blocks move-to-poi while active", async () => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "sess-1",
        campaignId: "camp-1",
        travelState: null,
      }),
    };
    const movementLockService = makeMovementLockService();
    const service = new MoveToPoiService(
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      movementLockService as any,
      makeLogger() as any,
    );

    const result = await service.run({
      sessionId: "sess-1",
      targetPoiId: "poi-2",
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "movement_lock",
      message:
        "Você está preso nesta conversa; encerre a interação antes de se deslocar.",
    });
  });
});
