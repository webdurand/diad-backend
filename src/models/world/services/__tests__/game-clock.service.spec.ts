import { Repository } from "typeorm";
import { GameClockEntity } from "src/entities/game-clock.entity";
import { GameClockService } from "../game-clock.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";

function makeRepo(initial?: Partial<GameClockEntity>): {
  repo: Repository<GameClockEntity>;
  saveSpy: jest.Mock;
} {
  let stored: GameClockEntity | null = initial
    ? ({
        id: "33333333-3333-4333-8333-333333333333",
        campaignId: CAMPAIGN_ID,
        currentInGameDateTime: new Date("2026-04-27T08:00:00.000Z"),
        sunriseTime: "06:00",
        sunsetTime: "18:00",
        daysPassed: 0,
        ...initial,
      } as GameClockEntity)
    : null;

  const saveSpy = jest.fn(async (e: GameClockEntity) => {
    stored = e;
    return e;
  });

  const repo = {
    findOne: jest.fn(async () => stored),
    create: jest.fn((p: Partial<GameClockEntity>) => ({
      id: "44444444-4444-4444-8444-444444444444",
      ...p,
    })),
    save: saveSpy,
  } as unknown as Repository<GameClockEntity>;

  return { repo, saveSpy };
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    registerListener: jest.fn(),
  } as unknown as EventBusService;
}

describe("GameClockService", () => {
  it("getOrCreate cria com defaults se ausente", async () => {
    const { repo } = makeRepo(undefined);
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new GameClockService(repo, makeBus(), factory);

    const clock = await svc.getOrCreate(CAMPAIGN_ID);
    expect(clock.campaignId).toBe(CAMPAIGN_ID);
    expect(clock.sunriseTime).toBe("06:00");
    expect(clock.sunsetTime).toBe("18:00");
    expect(clock.daysPassed).toBe(0);
  });

  it("advanceTime avança 4h e atualiza timeOfDay", async () => {
    const { repo, saveSpy } = makeRepo({
      currentInGameDateTime: new Date("2026-04-27T08:00:00.000Z"),
    });
    const factory = new EventEnvelopeFactory(undefined);
    const bus = makeBus();
    const svc = new GameClockService(repo, bus, factory);

    const result = await svc.advanceTime(CAMPAIGN_ID, { hours: 4 });

    expect(result.previousTimeOfDay).toBe("morning");

    expect(result.timeOfDay).toBe("afternoon");
    expect(saveSpy).toHaveBeenCalled();
    expect(bus.publish).toHaveBeenCalled();
  });

  it("advanceTime avança 24h aumentando daysPassed", async () => {
    const { repo } = makeRepo({
      currentInGameDateTime: new Date("2026-04-27T08:00:00.000Z"),
      daysPassed: 0,
    });
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new GameClockService(repo, makeBus(), factory);

    const result = await svc.advanceTime(CAMPAIGN_ID, { hours: 24 });
    expect(result.clock.daysPassed).toBe(1);
  });

  it("advanceTime rejeita hours <= 0", async () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new GameClockService(repo, makeBus(), factory);

    await expect(
      svc.advanceTime(CAMPAIGN_ID, { hours: 0 }),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      svc.advanceTime(CAMPAIGN_ID, { hours: -5 }),
    ).rejects.toMatchObject({ code: ErrorCode.CLOCK_NEGATIVE_HOURS });
  });

  it("advanceTime rejeita hours > 168", async () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new GameClockService(repo, makeBus(), factory);

    await expect(
      svc.advanceTime(CAMPAIGN_ID, { hours: 200 }),
    ).rejects.toMatchObject({ code: ErrorCode.CLOCK_NEGATIVE_HOURS });
  });

  it("getTimeOfDay deriva sem mutar state", async () => {
    const { repo } = makeRepo({
      currentInGameDateTime: new Date("2026-04-27T20:00:00.000Z"),
    });
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new GameClockService(repo, makeBus(), factory);

    expect(await svc.getTimeOfDay(CAMPAIGN_ID)).toBe("night");
  });
});
