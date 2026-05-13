import { Repository } from "typeorm";
import { AudienceRoutingEntity } from "src/entities/audience-routing.entity";
import { CampaignAudienceOverrideEntity } from "src/entities/campaign-audience-override.entity";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { AudienceMapService } from "../audience-map.service";

function makeLogger(): DiadLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as DiadLogger;
}

interface FakeRoutingRepo {
  findOne: jest.Mock;
  find: jest.Mock;
}

function makeRoutingRepo(): FakeRoutingRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
}

interface FakeOverrideRepo {
  findOne: jest.Mock;
  find: jest.Mock;
}

function makeOverrideRepo(): FakeOverrideRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
}

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

describe("AudienceMapService", () => {
  let routingRepo: FakeRoutingRepo;
  let overrideRepo: FakeOverrideRepo;
  let svc: AudienceMapService;

  beforeEach(() => {
    routingRepo = makeRoutingRepo();
    overrideRepo = makeOverrideRepo();
    svc = new AudienceMapService(
      routingRepo as unknown as Repository<AudienceRoutingEntity>,
      overrideRepo as unknown as Repository<CampaignAudienceOverrideEntity>,
      makeLogger(),
    );
    svc.clearCache();
  });

  it("resolve() retorna defaults da audience_routing quando sem override", async () => {
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
      defaultAudiences: ["CombatAgent", "Narrator", "HUD"],
      overrideable: true,
    });
    overrideRepo.findOne.mockResolvedValue(null);

    const audiences = await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    expect(audiences).toEqual(["CombatAgent", "Narrator", "HUD"]);
  });

  it("resolve() aplica override quando overrideable=true e row existe", async () => {
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
      defaultAudiences: ["CombatAgent", "Narrator", "HUD"],
      overrideable: true,
    });
    overrideRepo.findOne.mockResolvedValue({
      audiences: ["HUD"],
    });

    const audiences = await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    expect(audiences).toEqual(["HUD"]);
  });

  it("resolve() ignora override em rows com overrideable=false", async () => {
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "participant_died",
      defaultAudiences: [
        "CombatAgent",
        "Narrator",
        "Director",
        "HUD",
        "CompanionAI",
      ],
      overrideable: false,
    });

    const audiences = await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "participant_died",
    });
    expect(audiences).toEqual([
      "CombatAgent",
      "Narrator",
      "Director",
      "HUD",
      "CompanionAI",
    ]);

    expect(overrideRepo.findOne).not.toHaveBeenCalled();
  });

  it("resolve() retorna [] quando routing missing — bus não crasha", async () => {
    routingRepo.findOne.mockResolvedValue(null);
    const audiences = await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "ghost_event_xpto",
    });
    expect(audiences).toEqual([]);
  });

  it("cache TTL 60s — segunda chamada não consulta repo", async () => {
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
      defaultAudiences: ["CombatAgent", "HUD"],
      overrideable: true,
    });
    overrideRepo.findOne.mockResolvedValue(null);

    await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    expect(routingRepo.findOne).toHaveBeenCalledTimes(1);
    expect(overrideRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it("cache expira após 60s — terceira chamada re-consulta", async () => {
    jest.useFakeTimers();
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
      defaultAudiences: ["CombatAgent", "HUD"],
      overrideable: true,
    });
    overrideRepo.findOne.mockResolvedValue(null);

    try {
      await svc.resolve({
        scope: { campaignId: CAMPAIGN_ID },
        eventCategory: "EncounterEvent",
        eventType: "damage_applied",
      });
      jest.advanceTimersByTime(61_000);
      await svc.resolve({
        scope: { campaignId: CAMPAIGN_ID },
        eventCategory: "EncounterEvent",
        eventType: "damage_applied",
      });
      expect(routingRepo.findOne).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("invalidate(campaignId) limpa cache só pra aquela campanha", async () => {
    routingRepo.findOne.mockResolvedValue({
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
      defaultAudiences: ["HUD"],
      overrideable: true,
    });
    overrideRepo.findOne.mockResolvedValue(null);

    await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    svc.invalidate(CAMPAIGN_ID);
    await svc.resolve({
      scope: { campaignId: CAMPAIGN_ID },
      eventCategory: "EncounterEvent",
      eventType: "damage_applied",
    });
    expect(routingRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it("getCampaignMap() merge defaults + overrides preservando flags", async () => {
    routingRepo.find.mockResolvedValue([
      {
        eventCategory: "EncounterEvent",
        eventType: "damage_applied",
        defaultAudiences: ["CombatAgent", "Narrator", "HUD"],
        overrideable: true,
        subChannel: "hp-bar",
      },
      {
        eventCategory: "EncounterEvent",
        eventType: "participant_died",
        defaultAudiences: [
          "CombatAgent",
          "Narrator",
          "Director",
          "HUD",
          "CompanionAI",
        ],
        overrideable: false,
        subChannel: "toast",
      },
    ]);
    overrideRepo.find.mockResolvedValue([
      {
        eventCategory: "EncounterEvent",
        eventType: "damage_applied",
        audiences: ["HUD"],
      },
      {

        eventCategory: "EncounterEvent",
        eventType: "participant_died",
        audiences: ["HUD"],
      },
    ]);

    const map = await svc.getCampaignMap(CAMPAIGN_ID);
    expect(map).toHaveLength(2);
    const damaged = map.find((e) => e.eventType === "damage_applied")!;
    expect(damaged.audiences).toEqual(["HUD"]);
    expect(damaged.hasOverride).toBe(true);
    const died = map.find((e) => e.eventType === "participant_died")!;
    expect(died.audiences).toEqual([
      "CombatAgent",
      "Narrator",
      "Director",
      "HUD",
      "CompanionAI",
    ]);
    expect(died.hasOverride).toBe(false);
  });
});
