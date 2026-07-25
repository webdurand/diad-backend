import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { WorldPulseService } from "../world-pulse.service";

describe("WorldPulseService", () => {
  const createService = (overrides: Record<string, any> = {}) => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "session-1",
        campaignId: "campaign-1",
        ownerId: "owner-1",
        characterIds: ["char-1"],
        turnsSinceMissionProgress: 4,
      }),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "campaign-1",
        dmUserId: "dm-1",
      }),
    };
    const sceneRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "scene-1",
        sessionId: "session-1",
        poiId: "poi-wild",
        poi: {
          id: "poi-wild",
          kind: "wild",
          type: "forest",
          tags: ["forest"],
        },
      }),
    };
    const eventRepo = {
      count: jest.fn().mockResolvedValue(2),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const randomEncounter = {
      materialize: jest.fn().mockResolvedValue({ encounterId: "enc-1" }),
    };
    const characterClassRepo = {
      find: jest.fn().mockResolvedValue([
        { character_id: "char-1", class_level: 10 },
      ]),
    };
    const monsterSelector = {
      selectComposition: jest.fn().mockResolvedValue({
        monsterSlugs: ["wolf"],
        reasonChain: ["budget=2300"],
      }),
    };
    const difficultyPolicy = {
      resolve: jest.fn().mockImplementation((campaignDifficulty, requested) => ({
        campaignDifficulty: campaignDifficulty ?? "standard",
        requestedDifficulty: requested,
        effectiveDifficulty:
          campaignDifficulty === "gritty" ? "high" : requested,
        reason: `campaign_difficulty:${campaignDifficulty ?? "standard"}`,
      })),
    };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new WorldPulseService(
      overrides.sessionRepo ?? (sessionRepo as any),
      overrides.campaignRepo ?? (campaignRepo as any),
      overrides.sceneRepo ?? (sceneRepo as any),
      overrides.eventRepo ?? (eventRepo as any),
      overrides.characterClassRepo ?? (characterClassRepo as any),
      overrides.randomEncounter ?? (randomEncounter as any),
      overrides.monsterSelector ?? (monsterSelector as any),
      overrides.difficultyPolicy ?? (difficultyPolicy as any),
      overrides.eventBus ?? (eventBus as any),
      new EventEnvelopeFactory(undefined),
      { setContext: jest.fn(), warn: jest.fn() } as any,
    );
    return {
      service,
      randomEncounter,
      eventBus,
      monsterSelector,
      characterClassRepo,
    };
  };

  it("dispara encounter em POI wild com pull ativo e registra correlationKey", async () => {
    const { service, randomEncounter, eventBus } = createService();

    const result = await service.evaluate({
      sessionId: "session-1",
      traceId: "11111111111111111111111111111111",
    });

    expect(result).toMatchObject({
      triggered: true,
      reason: "random_encounter",
      correlationKey: "session-1:poi-wild:2",
    });
    expect(randomEncounter.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sceneId: "scene-1",
        monsterSlugs: ["wolf"],
        partyAvgLevel: 10,
        partySize: 1,
        difficulty: "moderate",
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "WorldEvent",
        eventType: "world_pulse_random_encounter_triggered",
        payload: expect.objectContaining({
          correlationKey: "session-1:poi-wild:2",
        }),
      }),
    );
  });

  it("nao redispara dentro do mesmo ciclo de pull", async () => {
    const { service, randomEncounter } = createService();

    await service.evaluate({ sessionId: "session-1" });
    const second = await service.evaluate({ sessionId: "session-1" });

    expect(second).toMatchObject({ triggered: false, reason: "cooldown" });
    expect(randomEncounter.materialize).toHaveBeenCalledTimes(1);
  });

  it("ignora POI que nao e wild", async () => {
    const { service, randomEncounter } = createService({
      sceneRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "scene-1",
          sessionId: "session-1",
          poiId: "poi-social",
          poi: { id: "poi-social", kind: "social", type: "tavern", tags: [] },
        }),
      },
    });

    const result = await service.evaluate({ sessionId: "session-1" });

    expect(result).toMatchObject({ triggered: false, reason: "poi_not_wild" });
    expect(randomEncounter.materialize).not.toHaveBeenCalled();
  });

  it("adapta orçamento ao nível real do grupo e ao modo gritty", async () => {
    const { service, randomEncounter, monsterSelector } = createService({
      campaignRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "campaign-1",
          dmUserId: "dm-1",
          difficulty: "gritty",
        }),
      },
      characterClassRepo: {
        find: jest.fn().mockResolvedValue([
          { character_id: "char-1", class_level: 15 },
        ]),
      },
    });

    await service.evaluate({ sessionId: "session-1" });

    expect(monsterSelector.selectComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        partyAvgLevel: 15,
        partySize: 1,
        targetDifficulty: "high",
      }),
    );
    expect(randomEncounter.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        partyAvgLevel: 15,
        difficulty: "high",
      }),
    );
  });
});
