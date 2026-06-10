import { DataSource } from "typeorm";
import { EventBusService } from "../event-bus.service";
import { AudienceMapService } from "../audience-map.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventEnvelope } from "../event-envelope.types";

function makeDataSource() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
  };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity, row: Record<string, unknown>) => row),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  return {
    manager,
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
}

function makeEnvelope(): EventEnvelope {
  return {
    eventId: "9f6c7b1a-2d3e-4f5a-8b9c-1d2e3f4a5b6c",
    version: 1,
    aggregateId: "22222222-2222-4222-8222-222222222222",
    timestamp: "2026-05-18T14:33:21.412Z",
    eventCategory: "NarrativeEvent",
    eventType: "compass_signal_emitted",
    source: {
      service: "diad-agents",
      module: "diad-agents:routers.narrative",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    },
    scope: {
      campaignId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
    payload: {
      sessionId: "22222222-2222-4222-8222-222222222222",
      heat: 0.6,
      driftAxis: "mission_distance",
      modality: "magnetic",
      beaconEmitted: true,
      turnsSinceMissionProgress: 6,
      scenesAtCurrentLocation: 4,
      components: {
        missionDistance: 0.6,
        locationStagnation: 0.42,
        phasePacing: 0,
        chaosDrift: 0,
      },
    },
    audiences: ["Narrator", "Director", "HUD"],
    narrativeDescriptor: "Compass detecta drift de missão; beacon ativado.",
  };
}

describe("compass_signal_emitted", () => {
  it("é registrado com traceId W3C e audiences cross-domain", async () => {
    const dataSource = makeDataSource();
    const service = new EventBusService(
      { resolve: jest.fn() } as unknown as AudienceMapService,
      { setContext: jest.fn(), error: jest.fn() } as unknown as DiadLogger,
      dataSource as unknown as DataSource,
    );

    const published = await service.publish(makeEnvelope());

    expect(published.source.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(published.audiences).toEqual(["Narrator", "Director", "HUD"]);
    expect(published.audiences.length).toBeGreaterThan(0);
  });
});
