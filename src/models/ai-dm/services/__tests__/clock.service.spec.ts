import { Repository } from "typeorm";
import { ClockEntity } from "src/entities/clock.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventLogService } from "src/models/session/services/event-log.service";
import { ClockService } from "../clock.service";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CLOCK_ID = "33333333-3333-4333-8333-333333333333";

function makeClock(overrides: Partial<ClockEntity> = {}): ClockEntity {
  return {
    id: CLOCK_ID,
    campaignId: CAMPAIGN_ID,
    campaign: undefined as unknown as never,
    gameSessionId: null,
    gameSession: undefined,
    name: "Ameaça na floresta",
    segments: 4,
    filled: 1,
    status: "active",
    type: "threat",
    visibleToPlayer: true,
    onFullAction: {
      trigger: "complication",
      narrativeSeed: "A patrulha chega.",
    },
    advanceRules: {},
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    ...overrides,
  };
}

function makeRow(overrides: Partial<ClockEntity> = {}): Record<string, unknown> {
  const clock = makeClock(overrides);
  return {
    id: clock.id,
    campaign_id: clock.campaignId,
    game_session_id: clock.gameSessionId ?? null,
    name: clock.name,
    segments: clock.segments,
    filled: clock.filled,
    status: clock.status,
    type: clock.type,
    visible_to_player: clock.visibleToPlayer,
    on_full_action: clock.onFullAction,
    advance_rules: clock.advanceRules,
    created_at: clock.createdAt,
    updated_at: clock.updatedAt,
    expires_at: clock.expiresAt ?? null,
  };
}

function makeService(options: {
  before?: Partial<ClockEntity>;
  row?: Partial<ClockEntity>;
  find?: ClockEntity[];
  session?: Partial<GameSessionEntity> | null;
}) {
  const clockRepo = {
    findOne: jest.fn(async () => makeClock(options.before)),
    query: jest.fn(async () => [makeRow(options.row)]),
    create: jest.fn((input: Partial<ClockEntity>) => input),
    save: jest.fn(async (input: ClockEntity) => input),
    find: jest.fn(async () => options.find ?? []),
  } as unknown as Repository<ClockEntity>;

  const sessionRepo = {
    findOne: jest.fn(async () =>
      options.session === null
        ? null
        : ({
            id: SESSION_ID,
            campaignId: CAMPAIGN_ID,
            ...options.session,
          } as GameSessionEntity),
    ),
  } as unknown as Repository<GameSessionEntity>;

  const eventLog = {
    logEvent: jest.fn(async () => undefined),
  } as unknown as EventLogService;

  const eventBus = {
    publish: jest.fn(async (envelope) => envelope),
  } as unknown as EventBusService;

  const service = new ClockService(
    clockRepo,
    sessionRepo,
    eventLog,
    eventBus,
    new EventEnvelopeFactory(undefined),
  );

  return {
    service,
    eventLog: eventLog as unknown as { logEvent: jest.Mock },
    eventBus: eventBus as unknown as { publish: jest.Mock },
    sessionRepo: sessionRepo as unknown as { findOne: jest.Mock },
    clockRepo: clockRepo as unknown as {
      query: jest.Mock;
      find: jest.Mock;
      findOne: jest.Mock;
    },
  };
}

describe("ClockService", () => {
  it("lista só templates quando consulta por campanha", async () => {
    const template = makeClock({ gameSessionId: null, filled: 0 });
    const { service, clockRepo } = makeService({ find: [template] });

    const result = await service.listByCampaign(CAMPAIGN_ID);

    expect(result).toEqual([template]);
    expect(clockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaignId: CAMPAIGN_ID }),
      }),
    );
  });

  it("materializa clocks limpos por sessão a partir dos templates", async () => {
    const sessionClock = makeClock({
      id: "44444444-4444-4444-8444-444444444444",
      gameSessionId: SESSION_ID,
      filled: 0,
      status: "active",
    });
    const { service, clockRepo } = makeService({ find: [sessionClock] });

    const result = await service.listBySession(SESSION_ID);

    expect(clockRepo.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO clocks"),
      [CAMPAIGN_ID, SESSION_ID],
    );
    expect(clockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: CAMPAIGN_ID,
          gameSessionId: SESSION_ID,
        }),
      }),
    );
    expect(result[0].filled).toBe(0);
    expect(result[0].gameSessionId).toBe(SESSION_ID);
  });

  it("advance clampa e publica clock_progressed", async () => {
    const { service, eventBus } = makeService({
      before: { filled: 1, segments: 4, status: "active" },
      row: { filled: 2, segments: 4, status: "active" },
    });

    const result = await service.advance(CLOCK_ID, {
      amount: 1,
      reason: "O grupo fez barulho demais.",
      sessionId: SESSION_ID,
    });

    expect(result.clock.filled).toBe(2);
    expect(result.previousFilled).toBe(1);
    expect(result.delta).toBe(1);
    expect(result.triggered).toBe(false);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const envelope = eventBus.publish.mock.calls[0][0];
    expect(envelope.eventType).toBe("clock_progressed");
    expect(envelope.payload.clockId).toBe(CLOCK_ID);
    expect(envelope.payload.delta).toBe(1);
  });

  it("publica evento no sessionId do clock de aventura mesmo sem dto.sessionId", async () => {
    const { service, eventBus } = makeService({
      before: { gameSessionId: SESSION_ID, filled: 1, segments: 4 },
      row: { gameSessionId: SESSION_ID, filled: 2, segments: 4 },
    });

    await service.advance(CLOCK_ID, { amount: 1 });

    const envelope = eventBus.publish.mock.calls[0][0];
    expect(envelope.scope.sessionId).toBe(SESSION_ID);
    expect(envelope.payload.sessionId).toBe(SESSION_ID);
  });

  it("publica clock_filled uma vez quando cruza o máximo", async () => {
    const { service, eventBus, eventLog } = makeService({
      before: { filled: 3, segments: 4, status: "active" },
      row: { filled: 4, segments: 4, status: "filled" },
    });

    const result = await service.advance(CLOCK_ID, {
      amount: 2,
      reason: "A patrulha alcançou a clareira.",
      sessionId: SESSION_ID,
    });

    expect(result.triggered).toBe(true);
    expect(result.clock.filled).toBe(4);
    expect(result.clock.status).toBe("filled");
    expect(eventLog.logEvent).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls.map(([envelope]) => envelope.eventType)).toEqual([
      "clock_progressed",
      "clock_filled",
    ]);
  });

  it("não reemite clock_filled quando já estava cheio", async () => {
    const { service, eventBus, eventLog } = makeService({
      before: { filled: 4, segments: 4, status: "filled" },
      row: { filled: 4, segments: 4, status: "filled" },
    });

    const result = await service.advance(CLOCK_ID, {
      amount: 1,
      reason: "Sem mudança real.",
      sessionId: SESSION_ID,
    });

    expect(result.triggered).toBe(false);
    expect(result.delta).toBe(0);
    expect(eventLog.logEvent).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("resolve marca status e publica clock_resolved", async () => {
    const { service, eventBus } = makeService({
      before: { filled: 2, segments: 4, status: "active" },
      row: { filled: 2, segments: 4, status: "resolved" },
    });

    const result = await service.resolve(CLOCK_ID, {
      reason: "A ameaça foi negociada.",
      sessionId: SESSION_ID,
    });

    expect(result.resolved).toBe(true);
    expect(result.clock.status).toBe("resolved");
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const envelope = eventBus.publish.mock.calls[0][0];
    expect(envelope.eventType).toBe("clock_resolved");
    expect(envelope.payload.status).toBe("resolved");
  });
});
