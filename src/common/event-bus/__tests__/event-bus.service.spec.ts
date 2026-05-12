import { DataSource } from "typeorm";
import { EventBusService } from "../event-bus.service";
import { AudienceMapService } from "../audience-map.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { EventCategory, EventEnvelope } from "../event-envelope.types";
import { EventListener } from "../event-bus.types";

function makeLogger(): DiadLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as DiadLogger;
}

interface FakeManager {
  query: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
}

interface FakeDataSource {
  manager: FakeManager;
  transaction: jest.Mock;
}

function makeDataSource(): FakeDataSource {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
  };
  const manager: FakeManager = {
    query: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity, row: Record<string, unknown>) => row),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  return {
    manager,
    transaction: jest.fn(async (cb: (m: FakeManager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
}

function makeAudienceMap(audiences: string[] = ["HUD"]): AudienceMapService {
  return {
    resolve: jest.fn().mockResolvedValue(audiences),
    getCampaignMap: jest.fn(),
    invalidate: jest.fn(),
    clearCache: jest.fn(),
  } as unknown as AudienceMapService;
}

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: "9f6c7b1a-2d3e-4f5a-8b9c-1d2e3f4a5b6c",
    version: 1,
    aggregateId: "33333333-3333-3333-3333-333333333333",
    timestamp: "2026-04-27T14:33:21.412Z",
    eventCategory: "EncounterEvent",
    eventType: "damage_applied",
    source: {
      service: "diad-backend",
      module: "CombatService.applyDamage",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    },
    scope: {
      campaignId: "11111111-1111-1111-1111-111111111111",
      sessionId: "22222222-2222-2222-2222-222222222222",
    },
    payload: { participantId: "x", hpBefore: 30, hpAfter: 12, amount: 18 },
    audiences: ["CombatAgent", "Narrator", "HUD"],
    ...overrides,
  };
}

describe("EventBusService", () => {
  let dataSource: FakeDataSource;
  let audienceMap: AudienceMapService;
  let logger: DiadLogger;
  let service: EventBusService;

  beforeEach(() => {
    dataSource = makeDataSource();
    audienceMap = makeAudienceMap();
    logger = makeLogger();
    service = new EventBusService(
      audienceMap,
      logger,
      dataSource as unknown as DataSource,
    );
  });

  it("publish() emite pra listeners da categoria correta", async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const listener: EventListener = {
      name: "TestListener",
      categories: ["EncounterEvent"],
      handle,
    };
    service.subscribe("EncounterEvent", listener);

    const env = makeEnvelope();
    await service.publish(env);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][0].eventId).toBe(env.eventId);
  });

  it("publish() não emite pra listeners de categoria diferente", async () => {
    const encounterHandle = jest.fn();
    const worldHandle = jest.fn();
    service.subscribe("EncounterEvent", {
      name: "EH",
      categories: ["EncounterEvent"],
      handle: encounterHandle,
    });
    service.subscribe("WorldEvent", {
      name: "WH",
      categories: ["WorldEvent"],
      handle: worldHandle,
    });

    await service.publish(makeEnvelope());

    expect(encounterHandle).toHaveBeenCalledTimes(1);
    expect(worldHandle).not.toHaveBeenCalled();
  });

  it("publish() rejeita eventType fora do catálogo (EVENT_TYPE_NOT_REGISTERED)", async () => {
    const env = makeEnvelope({ eventType: "unknown_type_xpto" });
    await expect(service.publish(env)).rejects.toMatchObject({
      code: ErrorCode.EVENT_TYPE_NOT_REGISTERED,
    });
    await expect(service.publish(env)).rejects.toBeInstanceOf(DomainException);
  });

  it("publish() persiste em session_events em background dentro de tx com advisory lock", async () => {
    const env = makeEnvelope();
    await service.publish(env);
    // background — flush microtasks
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(dataSource.manager.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [`session_event:${env.scope.sessionId}`],
    );
    expect(dataSource.manager.create).toHaveBeenCalled();
    const saveArg = dataSource.manager.create.mock.calls[0][1];
    expect(saveArg.eventCategory).toBe("EncounterEvent");
    expect(saveArg.eventType).toBe("damage_applied");
    expect(saveArg.traceId).toBe(env.source.traceId);
    expect(saveArg.aggregateId).toBe(env.aggregateId);
    expect(saveArg.version).toBe(1);
    expect(dataSource.manager.save).toHaveBeenCalled();
  });

  it("publish() não rollback se listener falha — outros listeners ainda executam", async () => {
    const failingHandle = jest
      .fn()
      .mockRejectedValue(new Error("listener crashed"));
    const goodHandle = jest.fn().mockResolvedValue(undefined);
    service.subscribe("EncounterEvent", {
      name: "FailingListener",
      categories: ["EncounterEvent"],
      handle: failingHandle,
    });
    service.subscribe("EncounterEvent", {
      name: "GoodListener",
      categories: ["EncounterEvent"],
      handle: goodHandle,
    });

    // publish() retorna envelope enriched (não undefined) — listener crash não rollback.
    await expect(service.publish(makeEnvelope())).resolves.toMatchObject({
      eventCategory: "EncounterEvent",
    });
    expect(goodHandle).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "event_bus.listener_failed",
      expect.any(Error),
      expect.objectContaining({ "listener.name": "FailingListener" }),
    );
  });

  it("subscribe() retorna unsubscribe funcional", async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const unsubscribe = service.subscribe("EncounterEvent", {
      name: "EphemeralListener",
      categories: ["EncounterEvent"],
      handle,
    });

    unsubscribe();

    await service.publish(makeEnvelope());
    expect(handle).not.toHaveBeenCalled();
  });

  it("publish() resolve audiences via AudienceMapService quando ausentes", async () => {
    const env = makeEnvelope({ audiences: [] });
    const handle = jest.fn().mockResolvedValue(undefined);
    service.subscribe("EncounterEvent", {
      name: "L1",
      categories: ["EncounterEvent"],
      handle,
    });
    await service.publish(env);

    expect(audienceMap.resolve).toHaveBeenCalled();
    const passed = handle.mock.calls[0][0] as EventEnvelope;
    expect(passed.audiences).toEqual(["HUD"]);
  });

  it("registerListener() registra em todas as categorias do listener", async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const cats: EventCategory[] = ["EncounterEvent", "WorldEvent"];
    const listener: EventListener = {
      name: "Multi",
      categories: cats,
      handle,
    };
    service.registerListener(listener);

    await service.publish(makeEnvelope());
    await service.publish(
      makeEnvelope({
        eventCategory: "WorldEvent",
        eventType: "weather_changed",
      }),
    );
    expect(handle).toHaveBeenCalledTimes(2);
  });
});
