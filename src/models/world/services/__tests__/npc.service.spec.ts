import { NpcService } from "../npc.service";

describe("NpcService.create — gameSessionId auto-attach", () => {
  const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
  const SESSION_ID = "22222222-2222-4222-8222-222222222222";
  const SCENE_ID = "33333333-3333-4333-8333-333333333333";
  const NPC_ID = "44444444-4444-4444-8444-444444444444";

  const LOCATION_ID = "55555555-5555-4555-8555-555555555555";

  function build(
    opts: { activeScene?: { id: string; locationId?: string } | null } = {},
  ) {
    const activeScene =
      "activeScene" in opts
        ? opts.activeScene
        : { id: SCENE_ID, locationId: LOCATION_ID };
    const npcRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (npc) => ({ ...npc, id: NPC_ID })),
    };
    const sceneRepo = {
      findOne: jest.fn(async () => activeScene),
    };
    const sceneNpcRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (sn) => sn),
    };
    const stateService = {
      getOrCreate: jest.fn(async () => ({})),
      upsert: jest.fn(async () => ({})),
    };
    const archetypeRepo = {
      findOne: jest.fn(async () => ({
        slug: "thug",
        monsterId: "m-thug",
      })),
    };

    const svc = new NpcService(
      npcRepo as never,
      {} as never,
      archetypeRepo as never,
      {} as never,
      {} as never,
      sceneRepo as never,
      sceneNpcRepo as never,
      stateService as never,
    );

    return { svc, npcRepo, sceneRepo, sceneNpcRepo, stateService };
  }

  it("sem gameSessionId: cria NPC canônico, NÃO toca scene_npcs nem state", async () => {
    const { svc, sceneRepo, sceneNpcRepo, stateService } = build();
    await svc.create(CAMPAIGN_ID, {
      name: "Padre Anselmo",
      archetypeSlug: "thug",
    });
    expect(sceneRepo.findOne).not.toHaveBeenCalled();
    expect(sceneNpcRepo.save).not.toHaveBeenCalled();
    expect(stateService.getOrCreate).not.toHaveBeenCalled();
  });

  it("com gameSessionId: anexa à scene ativa + cria session_npc_state + propaga locationId", async () => {
    const { svc, sceneRepo, sceneNpcRepo, stateService } = build();
    await svc.create(CAMPAIGN_ID, {
      name: "Capanga 1",
      archetypeSlug: "thug",
      gameSessionId: SESSION_ID,
      initialDisposition: "hostile",
    });
    expect(sceneRepo.findOne).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, isActive: true },
    });
    expect(sceneNpcRepo.save).toHaveBeenCalledTimes(1);
    expect(sceneNpcRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: SCENE_ID, npcId: NPC_ID }),
    );
    expect(stateService.getOrCreate).toHaveBeenCalledWith(SESSION_ID, NPC_ID, {
      disposition: "hostile",
    });
    expect(stateService.upsert).toHaveBeenCalledWith(SESSION_ID, NPC_ID, {
      currentLocationId: LOCATION_ID,
    });
  });

  it("com gameSessionId mas sem scene ativa: cria state mas pula scene_npcs", async () => {
    const { svc, sceneNpcRepo, stateService } = build({ activeScene: null });
    await svc.create(CAMPAIGN_ID, {
      name: "Velho Tom",
      archetypeSlug: "commoner",
      gameSessionId: SESSION_ID,
      initialDisposition: "neutral",
    });
    expect(stateService.getOrCreate).toHaveBeenCalledTimes(1);
    expect(sceneNpcRepo.save).not.toHaveBeenCalled();
  });

  it("auto-marca provenance='auto-materialized' quando session-scoped", async () => {
    const { svc, npcRepo } = build();
    await svc.create(CAMPAIGN_ID, {
      name: "Capanga 1",
      archetypeSlug: "thug",
      gameSessionId: SESSION_ID,
    });
    const saved = (npcRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved.provenance).toBe("auto-materialized");
    expect(saved.gameSessionId).toBe(SESSION_ID);
  });

  it("idempotente: scene_npcs já existe → não duplica save", async () => {
    const { svc, sceneNpcRepo } = build();
    sceneNpcRepo.findOne = jest.fn(async () => ({
      id: "existing",
      sceneId: SCENE_ID,
      npcId: NPC_ID,
    })) as any;
    await svc.create(CAMPAIGN_ID, {
      name: "Capanga 1",
      archetypeSlug: "thug",
      gameSessionId: SESSION_ID,
    });
    expect(sceneNpcRepo.save).not.toHaveBeenCalled();
  });
});
