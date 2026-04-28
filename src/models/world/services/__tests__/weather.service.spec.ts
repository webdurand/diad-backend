import { IsNull, Repository } from "typeorm";
import { WeatherEntity } from "src/entities/weather.entity";
import { WeatherService } from "../weather.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const SCENE_ID = "22222222-2222-4222-8222-222222222222";

function makeRepo(): {
  repo: Repository<WeatherEntity>;
  saveSpy: jest.Mock;
} {
  const stored = new Map<string, WeatherEntity>();
  const findOne = jest.fn(async ({ where }: any) => {
    const key = `${where.campaignId}:${where.sceneId === IsNull() || where.sceneId === null ? "null" : where.sceneId}`;
    return stored.get(key) ?? null;
  });
  const create = jest.fn((p: Partial<WeatherEntity>) => ({
    id: "55555555-5555-4555-8555-555555555555",
    rolledAt: new Date(),
    ...p,
  }));
  const saveSpy = jest.fn(async (e: WeatherEntity) => {
    const key = `${e.campaignId}:${e.sceneId ?? "null"}`;
    stored.set(key, e);
    return e;
  });
  return {
    repo: { findOne, create, save: saveSpy } as unknown as Repository<WeatherEntity>,
    saveSpy,
  };
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    registerListener: jest.fn(),
  } as unknown as EventBusService;
}

describe("WeatherService", () => {
  it("rollWeather aplica modifiers RAW pra storm (perception -2 + ranged disadv)", async () => {
    const { repo } = makeRepo();
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, bus, factory);

    // Mock Math.random pra forçar storm em 'plains' (storm prob = 15, range 50..65)
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.6);
    try {
      const w = await svc.rollWeather(CAMPAIGN_ID, "plains");
      if (w.precipitation === "storm") {
        expect(w.affectsChecks.perception).toBe(-2);
        expect(w.affectsChecks.ranged).toBe("disadvantage");
        expect(w.windStrength).toBe("gale");
      }
    } finally {
      spy.mockRestore();
    }
    expect(bus.publish).toHaveBeenCalled();
  });

  it("rollWeather snow aplica speedMultiplier 0.5 (terreno difícil)", async () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, makeBus(), factory);
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.7); // mountain snow range
    try {
      const w = await svc.rollWeather(CAMPAIGN_ID, "mountain");
      if (w.precipitation === "snow") {
        expect(w.affectsChecks.speedMultiplier).toBe(0.5);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("rollWeather magical seta magicalAnomaly weave_unstable", async () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, makeBus(), factory);
    // desert magical = 20%, posicionado no fim → r > 0.80
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.95);
    try {
      const w = await svc.rollWeather(CAMPAIGN_ID, "desert");
      if (w.precipitation === "magical") {
        expect(w.magicalAnomaly).toBe("weave_unstable");
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("rollWeather rejeita biome inválido", async () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, makeBus(), factory);

    await expect(
      svc.rollWeather(CAMPAIGN_ID, "underwater" as any),
    ).rejects.toMatchObject({ code: ErrorCode.WEATHER_INVALID_BIOME });
  });

  it("rollWeather com sceneId cria override de cena", async () => {
    const { repo, saveSpy } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, makeBus(), factory);

    await svc.rollWeather(CAMPAIGN_ID, "forest", { sceneId: SCENE_ID });
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: SCENE_ID }),
    );
  });

  it("toDto serializa shape canônico", () => {
    const { repo } = makeRepo();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new WeatherService(repo, makeBus(), factory);
    const dto = svc.toDto({
      id: "abc",
      campaignId: CAMPAIGN_ID,
      sceneId: null,
      precipitation: "rain",
      visibility: "dim",
      temperature: "mild",
      windStrength: "breeze",
      magicalAnomaly: null,
      affectsChecks: { stealth: 1 },
      narrativeSeed: "Chuva fina",
      rolledAt: new Date("2026-04-27T10:00:00.000Z"),
    } as WeatherEntity);
    expect(dto).toMatchObject({
      precipitation: "rain",
      visibility: "dim",
      affectsChecks: { stealth: 1 },
    });
    expect(dto.rolledAt).toBe("2026-04-27T10:00:00.000Z");
  });
});
