import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { HUDListener } from "../listeners/hud.listener";
import { EventEnvelope } from "../event-envelope.types";

function makeLogger(): DiadLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as DiadLogger;
}

interface FakeProcessedRepo {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

function makeRepo(): FakeProcessedRepo {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((row: Record<string, unknown>) => row),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEnv(audiences: string[] = ["HUD"]): EventEnvelope {
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
    audiences: audiences as EventEnvelope["audiences"],
  };
}

describe("HUDListener", () => {
  let repo: FakeProcessedRepo;
  let logger: DiadLogger;
  let listener: HUDListener;

  beforeEach(() => {
    repo = makeRepo();
    logger = makeLogger();
    listener = new HUDListener(
      repo as unknown as Repository<EventListenerProcessedEntity>,
      logger,
    );
  });

  it("ignora envelope sem 'HUD' em audiences", async () => {
    await listener.handle(makeEnv(["CombatAgent", "Narrator"]));
    expect(repo.save).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("processa envelope com 'HUD' — log + mark processed", async () => {
    await listener.handle(makeEnv(["HUD"]));
    expect(logger.info).toHaveBeenCalledWith(
      "event_bus.hud.received",
      expect.objectContaining({
        "event.id": "9f6c7b1a-2d3e-4f5a-8b9c-1d2e3f4a5b6c",
        "event.type": "damage_applied",
        "trace.id": "0af7651916cd43dd8448eb211c80319c",
      }),
    );
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it("idempotente: 2x handle() mesmo eventId → side-effect 1×", async () => {
    repo.findOne
      .mockResolvedValueOnce(null) // 1ª passada — não processado ainda
      .mockResolvedValueOnce({ id: "p1" }); // 2ª passada — já processado

    const env = makeEnv(["HUD"]);
    await listener.handle(env);
    await listener.handle(env);

    expect(repo.save).toHaveBeenCalledTimes(1);
    // info loggado só na 1ª passada — 2ª retorna antes do log
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("registra em event_listener_processed com listenerName + eventId", async () => {
    await listener.handle(makeEnv(["HUD"]));
    expect(repo.create).toHaveBeenCalledWith({
      listenerName: "HUDListener",
      eventId: "9f6c7b1a-2d3e-4f5a-8b9c-1d2e3f4a5b6c",
    });
  });

  it("cobre todas as 4 categorias", () => {
    expect(listener.categories).toEqual(
      expect.arrayContaining([
        "EncounterEvent",
        "WorldEvent",
        "NarrativeEvent",
        "SocialEvent",
      ]),
    );
  });
});
