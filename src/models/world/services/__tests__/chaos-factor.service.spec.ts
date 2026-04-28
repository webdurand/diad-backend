import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { ChaosFactorService } from "../chaos-factor.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";

function makeRepo(chaosFactor = 5): Repository<CampaignEntity> {
  const stored = {
    id: CAMPAIGN_ID,
    chaosFactor,
  } as CampaignEntity;
  return {
    findOne: jest.fn(async () => stored),
    save: jest.fn(async (c: CampaignEntity) => c),
  } as unknown as Repository<CampaignEntity>;
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

    const result = await svc.setChaosFactor(CAMPAIGN_ID, 7, "director");
    expect(result.oldValue).toBe(5);
    expect(result.newValue).toBe(7);
    expect(bus.publish).toHaveBeenCalled();
  });

  it("é no-op quando value não muda (sem emit)", async () => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await svc.setChaosFactor(CAMPAIGN_ID, 5, "director");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it.each([0, 10, -1, 1.5, NaN])("rejeita value inválido %p", async (v) => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await expect(
      svc.setChaosFactor(CAMPAIGN_ID, v as number, "director"),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it("rejeita campaign não encontrada", async () => {
    const repo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(),
    } as unknown as Repository<CampaignEntity>;
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, makeBus(), factory);

    await expect(
      svc.setChaosFactor(CAMPAIGN_ID, 7, "director"),
    ).rejects.toMatchObject({ code: ErrorCode.CAMPAIGN_NOT_FOUND });
  });

  it("aceita source 'event' e 'director' (DM-controlled)", async () => {
    const repo = makeRepo(5);
    const bus = makeBus();
    const factory = new EventEnvelopeFactory(undefined);
    const svc = new ChaosFactorService(repo, bus, factory);

    await svc.setChaosFactor(CAMPAIGN_ID, 6, "event");
    await svc.setChaosFactor(CAMPAIGN_ID, 7, "director");
    expect(bus.publish).toHaveBeenCalledTimes(2);
  });
});
