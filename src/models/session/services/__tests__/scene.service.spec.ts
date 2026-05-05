import { SceneService } from "../scene.service";
import { SceneEntity } from "src/entities/scene.entity";
import { CampaignEntity } from "src/entities/campaign.entity";

/**
 * Spec: SceneService.create() emite NarrativeEvent.scene_changed para
 * EventBus quando há transição de cena. Cobre:
 *   - emit no fluxo "transição" (previousActive existe)
 *   - emit no fluxo "abertura" (sem previousActive)
 *   - skip silencioso quando session sem campaignId (best-effort)
 *   - falha em publish não rollbacka save da cena
 *   - cache invalidation da cena anterior
 */
describe("SceneService.create — scene_changed emission", () => {
  const SESSION_ID = "session-uuid";
  const CAMPAIGN_ID = "campaign-uuid";
  const PREV_SCENE_ID = "prev-scene-uuid";
  const NEW_SCENE_ID = "new-scene-uuid";

  function buildService(opts: {
    previousActive?: { id: string } | null;
    campaign?: Partial<CampaignEntity> | null;
    publishThrows?: Error;
  } = {}) {
    const sceneRepo = {
      findOne: jest.fn().mockResolvedValue(opts.previousActive ?? null),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data: any) => ({ ...data, id: NEW_SCENE_ID })),
      save: jest.fn(async (entity: any) => entity),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: "0" }),
      })),
    };
    const sceneNpcRepo = {} as any;
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(
        opts.campaign ? { id: SESSION_ID, campaignId: opts.campaign.id } : { id: SESSION_ID, campaignId: null },
      ),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue(opts.campaign ?? null),
      save: jest.fn(async (c: any) => c),
    };
    const vowRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const campaignService = {
      incrementCount: jest.fn().mockResolvedValue(undefined),
    };
    const contextCache = {
      invalidate: jest.fn(),
    };
    const eventBus = {
      publish: opts.publishThrows
        ? jest.fn().mockRejectedValue(opts.publishThrows)
        : jest.fn().mockResolvedValue(undefined),
    };
    const envelopeFactory = {
      build: jest.fn((args: any) => ({ ...args, id: "env-1" })),
    };
    const logger = {
      setContext: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const service = new SceneService(
      sceneRepo as any,
      sceneNpcRepo,
      sessionRepo as any,
      campaignRepo as any,
      vowRepo as any,
      campaignService as any,
      contextCache as any,
      eventBus as any,
      envelopeFactory as any,
      logger as any,
      { upsert: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return {
      service,
      mocks: {
        sceneRepo,
        sessionRepo,
        campaignRepo,
        contextCache,
        eventBus,
        envelopeFactory,
        logger,
      },
    };
  }

  it("emite scene_changed com fromSceneId quando há cena anterior ativa", async () => {
    const campaign = {
      id: CAMPAIGN_ID,
      contentBudget: { maxScenes: 12 },
      arcState: {
        currentBeat: "YOU",
        beatEnteredAtScene: 1,
        transitionHistory: [],
      },
      questionAnswered: false,
      currentCounts: { scenes: 0 },
    } as any;

    const { service, mocks } = buildService({
      previousActive: { id: PREV_SCENE_ID },
      campaign,
    });

    await service.create(SESSION_ID, {
      title: "Câmara secreta",
      reason: "player_entered_chamber",
    });

    expect(mocks.eventBus.publish).toHaveBeenCalledTimes(1);
    expect(mocks.envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "scene_changed",
        scope: expect.objectContaining({
          campaignId: CAMPAIGN_ID,
          sessionId: SESSION_ID,
          sceneId: NEW_SCENE_ID,
        }),
        audiences: expect.arrayContaining(["Director", "Narrator", "HUD"]),
        payload: expect.objectContaining({
          fromSceneId: PREV_SCENE_ID,
          toSceneId: NEW_SCENE_ID,
          reason: "player_entered_chamber",
        }),
      }),
    );
  });

  it("emite scene_changed com fromSceneId=null quando é primeira cena", async () => {
    const campaign = {
      id: CAMPAIGN_ID,
      contentBudget: { maxScenes: 12 },
      arcState: {
        currentBeat: "YOU",
        beatEnteredAtScene: 1,
        transitionHistory: [],
      },
      questionAnswered: false,
      currentCounts: { scenes: 0 },
    } as any;

    const { service, mocks } = buildService({
      previousActive: null,
      campaign,
    });

    await service.create(SESSION_ID, { title: "Abertura" });

    expect(mocks.eventBus.publish).toHaveBeenCalledTimes(1);
    expect(mocks.envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "scene_changed",
        payload: expect.objectContaining({
          fromSceneId: null,
          toSceneId: NEW_SCENE_ID,
        }),
      }),
    );
  });

  it("não emite quando session não tem campaignId (best-effort skip)", async () => {
    const { service, mocks } = buildService({
      previousActive: { id: PREV_SCENE_ID },
      campaign: null,
    });

    await service.create(SESSION_ID, { title: "Sem campanha" });

    expect(mocks.eventBus.publish).not.toHaveBeenCalled();
    expect(mocks.envelopeFactory.build).not.toHaveBeenCalled();
  });

  it("falha em publish não rollbacka save (cena criada mesmo assim)", async () => {
    const campaign = {
      id: CAMPAIGN_ID,
      contentBudget: { maxScenes: 12 },
      arcState: {
        currentBeat: "YOU",
        beatEnteredAtScene: 1,
        transitionHistory: [],
      },
      questionAnswered: false,
      currentCounts: { scenes: 0 },
    } as any;

    const { service, mocks } = buildService({
      previousActive: { id: PREV_SCENE_ID },
      campaign,
      publishThrows: new Error("event bus down"),
    });

    const created = await service.create(SESSION_ID, { title: "X" });

    expect(created.id).toBe(NEW_SCENE_ID);
    expect(mocks.eventBus.publish).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "scene.changed.publish_failed",
      expect.any(Error),
      expect.objectContaining({
        "session.id": SESSION_ID,
        "scene.from": PREV_SCENE_ID,
        "scene.to": NEW_SCENE_ID,
      }),
    );
  });

  it("invalida cache da cena anterior", async () => {
    const campaign = {
      id: CAMPAIGN_ID,
      contentBudget: { maxScenes: 12 },
      arcState: {
        currentBeat: "YOU",
        beatEnteredAtScene: 1,
        transitionHistory: [],
      },
      questionAnswered: false,
      currentCounts: { scenes: 0 },
    } as any;

    const { service, mocks } = buildService({
      previousActive: { id: PREV_SCENE_ID },
      campaign,
    });

    await service.create(SESSION_ID, { title: "Nova" });

    expect(mocks.contextCache.invalidate).toHaveBeenCalledWith(PREV_SCENE_ID);
  });
});
