import { Repository } from "typeorm";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { ChaosFactorService } from "../chaos-factor.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

function makeRepo(chaosFactor = 5): Repository<GameSessionEntity> {
  const stored = {
    id: SESSION_ID,
    campaignId: CAMPAIGN_ID,
    chaosFactor,
  } as unknown as GameSessionEntity;
  return {
    findOne: jest.fn(async () => stored),
    save: jest.fn(async (s: GameSessionEntity) => s),
  } as unknown as Repository<GameSessionEntity>;
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    registerListener: jest.fn(),
  } as unknown as EventBusService;
}

describe("ChaosFactorService", () => {
  it("aceita value 1..9 e emite chaos_factor_changed", async () => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    const result = await svc.setChaosFactor(SESSION_ID, 7, "director");
    expect(result.oldValue).toBe(5);
    expect(result.newValue).toBe(7);
    expect(bus.publish).toHaveBeenCalled();
  });

  it("é no-op quando value não muda (sem emit)", async () => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await svc.setChaosFactor(SESSION_ID, 5, "director");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it.each([0, 10, -1, 1.5, NaN])("rejeita value inválido %p", async (v) => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await expect(
      svc.setChaosFactor(SESSION_ID, v, "director"),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it("rejeita session não encontrada", async () => {
    const repo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(),
    } as unknown as Repository<GameSessionEntity>;
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, makeBus(), factory);

    await expect(
      svc.setChaosFactor(SESSION_ID, 7, "director"),
    ).rejects.toMatchObject({ code: ErrorCode.CAMPAIGN_NOT_FOUND });
  });

  it("aceita source 'event' e 'director' (DM-controlled)", async () => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await svc.setChaosFactor(SESSION_ID, 6, "event");
    await svc.setChaosFactor(SESSION_ID, 7, "director");
    expect(bus.publish).toHaveBeenCalledTimes(2);
  });
});
