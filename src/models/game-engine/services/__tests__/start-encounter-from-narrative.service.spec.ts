import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { StartEncounterFromNarrativeService } from "../start-encounter-from-narrative.service";
import { EncounterService } from "../encounter.service";
import { CombatService } from "../combat.service";
import { DiceService } from "../dice.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SCENE_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const NPC_ID_OK = "44444444-4444-4444-8444-444444444444";
const NPC_ID_NO_MONSTER = "55555555-5555-4555-8555-555555555555";
const MONSTER_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_USER_ID = "77777777-7777-4777-8777-777777777777";
const ENCOUNTER_ID = "88888888-8888-4888-8888-888888888888";

interface RepoOverrides {
  scene?: Partial<SceneEntity> | null;
  npcs?: Record<string, Partial<NpcEntity> | null>;
  monster?: Partial<MonsterEntity> | null;
  session?: Partial<GameSessionEntity> | null;
}

function makeSceneRepo(
  scene: Partial<SceneEntity> | null,
  active: Partial<SceneEntity> | null = null,
) {
  let savedStub: Partial<SceneEntity> | null = null;
  return {
    findOne: jest.fn(async (opts: any) => {
      // findOne by id (primeiro lookup do path com sceneId explícito)
      if (opts?.where?.id) return scene as SceneEntity | null;
      // findOne by isActive=true (lookup do path sem sceneId)
      if (opts?.where?.isActive === true) {
        return (savedStub ?? active) as SceneEntity | null;
      }
      return null;
    }),
    count: jest.fn(async () => 0),
    create: jest.fn((data: any) => ({
      id: "auto-scene-99999999-9999-4999-8999-999999999999",
      ...data,
    })),
    save: jest.fn(async (data: any) => {
      savedStub = { ...data, id: data.id ?? "auto-scene-99999999-9999-4999-8999-999999999999" };
      return savedStub;
    }),
  } as unknown as Repository<SceneEntity>;
}

function makeNpcRepo(npcs: Record<string, Partial<NpcEntity> | null>) {
  return {
    findOne: jest.fn(async (opts: any) => {
      const id = opts?.where?.id;
      const npc = npcs[id];
      if (!npc) return null;
      return npc as NpcEntity;
    }),
  } as unknown as Repository<NpcEntity>;
}

function makeMonsterRepo(monster: Partial<MonsterEntity> | null) {
  return {
    findOne: jest.fn(async () => monster as MonsterEntity | null),
  } as unknown as Repository<MonsterEntity>;
}

let savedParticipants: any[] = [];
function makeParticipantRepo() {
  return {
    create: jest.fn((data: any) => ({
      id: `npc-part-${savedParticipants.length + 1}`,
      ...data,
    })),
    save: jest.fn(async (p: any) => {
      const stored = { ...p, id: p.id ?? `npc-part-${savedParticipants.length + 1}` };
      savedParticipants.push(stored);
      return stored;
    }),
  } as unknown as Repository<EncounterParticipantEntity>;
}

function makeSessionRepo(session: Partial<GameSessionEntity> | null) {
  return {
    findOne: jest.fn(async () => session as GameSessionEntity | null),
  } as unknown as Repository<GameSessionEntity>;
}

function makeEncounterService(
  initialParticipants: any[] = [],
): EncounterService {
  // mantém uma lista interna mutável de participants (PCs + NPCs após materialização)
  let participants = [...initialParticipants];
  const encounter: any = {
    id: ENCOUNTER_ID,
    sessionId: SESSION_ID,
    name: "Combate narrativo",
    status: "preparing",
    currentRound: 1,
    turnOrder: [],
    mapData: { gridColumns: 10, gridRows: 10 },
    participants,
  };
  return {
    create: jest.fn(async () => encounter),
    getById: jest.fn(async () => {
      // depois da materialização, savedParticipants tem os NPCs novos.
      // simulamos fazer merge dos NPCs criados via participantRepo.save com os PCs iniciais.
      const merged = [...participants, ...savedParticipants];
      encounter.participants = merged;
      return encounter;
    }),
    setManualInitiative: jest.fn(async () => undefined),
    batchUpdatePositions: jest.fn(async () => []),
    startCombat: jest.fn(async () => {
      encounter.status = "active";
      const all = encounter.participants ?? [];
      encounter.turnOrder = all.map((p: any) => p.id);
      encounter.currentRound = 1;
      return encounter;
    }),
  } as unknown as EncounterService;
}

function makeCombatService(): CombatService {
  return {
    applyCondition: jest.fn(async () => ({ ok: true, value: { conditions: [] } })),
  } as unknown as CombatService;
}

function makeDiceService(): DiceService {
  return {
    rollExpression: jest.fn((expr: string) => {
      // determinístico nos testes: sempre soma 10
      return { total: 10, breakdown: expr } as any;
    }),
  } as unknown as DiceService;
}

function makeEventBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

function build(over: RepoOverrides = {}, opts: { withPc?: boolean } = {}) {
  savedParticipants = [];
  const sceneRepo = makeSceneRepo(
    over.scene === undefined
      ? { id: SCENE_ID, sessionId: SESSION_ID }
      : over.scene,
  );
  const npcRepo = makeNpcRepo(
    over.npcs ?? {
      [NPC_ID_OK]: {
        id: NPC_ID_OK,
        name: "Goblin Bandido",
        monsterId: MONSTER_ID,
        monster: {
          id: MONSTER_ID,
          name: "Goblin",
          hit_points: 7,
          hit_points_roll: "2d6",
          dexterity: 14,
        } as any,
      },
    },
  );
  const monsterRepo = makeMonsterRepo(
    over.monster === undefined
      ? { id: MONSTER_ID, hit_points: 7, hit_points_roll: "2d6", dexterity: 14 }
      : over.monster,
  );
  const partRepo = makeParticipantRepo();
  const sessionRepo = makeSessionRepo(
    over.session === undefined
      ? { id: SESSION_ID, campaignId: CAMPAIGN_ID }
      : over.session,
  );
  const initialPcs = opts.withPc
    ? [
        {
          id: "pc-1",
          type: "pc",
          characterId: "char-1",
          displayName: "Aragorn",
          initiativeModifier: 3,
        },
      ]
    : [];
  const encounterSvc = makeEncounterService(initialPcs);
  const combatSvc = makeCombatService();
  const diceSvc = makeDiceService();
  const bus = makeEventBus();

  // NpcService stub — materializeStubFromName usado só no path de targets por
  // nome livre; testes existentes passam UUIDs e não tocam aqui.
  const npcSvc = {
    materializeStubFromName: jest.fn(),
    findByNameInCampaign: jest.fn(),
  } as unknown as import("src/models/world/services/npc.service").NpcService;

  // SceneContextService stub — assembleContext só roda no fallback "targets
  // vazios" do botão "Iniciar combate"; testes que passam targetNpcIds não
  // tocam aqui.
  const sceneCtxSvc = {
    assembleContext: jest.fn().mockResolvedValue({
      scene: {},
      npcsPresent: [],
      recentEvents: [],
      partyKnowledge: [],
      locationChain: [],
      recentChronicles: [],
    }),
  } as unknown as import("src/models/session/services/scene-context.service").SceneContextService;

  const messageRepo = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as import("typeorm").Repository<
    import("src/entities/session-message.entity").SessionMessageEntity
  >;

  const aiProxy = {
    postJsonToAgent: jest.fn().mockResolvedValue({ targets: [], count: 0 }),
  } as unknown as import("src/models/ai-proxy/ai-proxy.service").AiProxyService;

  const svc = new StartEncounterFromNarrativeService(
    sceneRepo,
    npcRepo,
    monsterRepo,
    partRepo,
    sessionRepo,
    messageRepo,
    encounterSvc,
    combatSvc,
    diceSvc,
    npcSvc,
    sceneCtxSvc,
    bus,
    new EventEnvelopeFactory(undefined),
    aiProxy,
  );
  return { svc, encounterSvc, combatSvc, bus, partRepo, aiProxy, messageRepo };
}

describe("StartEncounterFromNarrativeService — Spec 020", () => {
  it("happy path: cria encounter + materializa NPC + place tokens + start combat", async () => {
    const { svc, encounterSvc } = build();
    const result = await svc.run({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      targetNpcIds: [NPC_ID_OK],
      ownerUserId: OWNER_USER_ID,
    });
    expect(result.encounterId).toBe(ENCOUNTER_ID);
    expect(result.participantIds.length).toBeGreaterThanOrEqual(1);
    expect(result.turnOrder.length).toBeGreaterThanOrEqual(1);
    expect(result.currentParticipantId).toBe(result.turnOrder[0]);
    expect(result.round).toBe(1);
    expect(encounterSvc.startCombat).toHaveBeenCalledWith(ENCOUNTER_ID);
    expect(encounterSvc.batchUpdatePositions).toHaveBeenCalled();
  });

  it("scene não encontrada → SCENE_NOT_FOUND", async () => {
    const { svc } = build({ scene: null });
    await expect(
      svc.run({
        sessionId: SESSION_ID,
        sceneId: SCENE_ID,
        targetNpcIds: [NPC_ID_OK],
        ownerUserId: OWNER_USER_ID,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.SCENE_NOT_FOUND });
  });

  it("scene de outra session → SCENE_NOT_FOUND", async () => {
    const { svc } = build({
      scene: { id: SCENE_ID, sessionId: "outra-session" },
    });
    await expect(
      svc.run({
        sessionId: SESSION_ID,
        sceneId: SCENE_ID,
        targetNpcIds: [NPC_ID_OK],
        ownerUserId: OWNER_USER_ID,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.SCENE_NOT_FOUND });
  });

  it("NPC sem monsterId → NPC_NOT_HOSTILE_CAPABLE com name no context", async () => {
    const { svc } = build({
      npcs: {
        [NPC_ID_NO_MONSTER]: {
          id: NPC_ID_NO_MONSTER,
          name: "Velho Tom",
          monsterId: undefined,
        },
      },
    });
    await expect(
      svc.run({
        sessionId: SESSION_ID,
        sceneId: SCENE_ID,
        targetNpcIds: [NPC_ID_NO_MONSTER],
        ownerUserId: OWNER_USER_ID,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.NPC_NOT_HOSTILE_CAPABLE,
      response: expect.objectContaining({
        context: expect.objectContaining({ name: "Velho Tom" }),
      }),
    });
  });

  it("surprise_round=true → applyCondition('surprised') chamada para cada NPC", async () => {
    const { svc, combatSvc } = build();
    await svc.run({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      targetNpcIds: [NPC_ID_OK],
      surpriseRound: true,
      ownerUserId: OWNER_USER_ID,
    });
    expect(combatSvc.applyCondition).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      expect.objectContaining({
        condition: "surprised",
        apply: true,
      }),
    );
  });

  it("auto_place_tokens=false → NÃO chama batchUpdatePositions", async () => {
    const { svc, encounterSvc } = build();
    await svc.run({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      targetNpcIds: [NPC_ID_OK],
      autoPlaceTokens: false,
      ownerUserId: OWNER_USER_ID,
    });
    expect(encounterSvc.batchUpdatePositions).not.toHaveBeenCalled();
  });

  it("sceneId omitido + active scene existe → usa a active", async () => {
    // Override sceneRepo direto pra retornar active mock
    const activeScene: Partial<SceneEntity> = {
      id: "active-scene-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sessionId: SESSION_ID,
      isActive: true,
    };
    const sceneRepo = makeSceneRepo(null, activeScene);
    const npcRepo = makeNpcRepo({
      [NPC_ID_OK]: {
        id: NPC_ID_OK,
        name: "Goblin",
        monsterId: MONSTER_ID,
        monster: {
          id: MONSTER_ID,
          name: "Goblin",
          hit_points: 7,
          hit_points_roll: "2d6",
          dexterity: 14,
        } as any,
      },
    });
    const monsterRepo = makeMonsterRepo({
      id: MONSTER_ID,
      hit_points: 7,
      hit_points_roll: "2d6",
      dexterity: 14,
    });
    const partRepo = makeParticipantRepo();
    const sessionRepo = makeSessionRepo({ id: SESSION_ID, campaignId: CAMPAIGN_ID });
    savedParticipants = [];
    const encounterSvc = makeEncounterService([]);
    const npcSvc = {
      materializeStubFromName: jest.fn(),
      findByNameInCampaign: jest.fn(),
    } as unknown as import("src/models/world/services/npc.service").NpcService;
    const sceneCtxSvc = {
      assembleContext: jest.fn().mockResolvedValue({
        scene: {},
        npcsPresent: [],
        recentEvents: [],
        partyKnowledge: [],
        locationChain: [],
        recentChronicles: [],
      }),
    } as unknown as import("src/models/session/services/scene-context.service").SceneContextService;

    const messageRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    } as unknown as import("typeorm").Repository<
      import("src/entities/session-message.entity").SessionMessageEntity
    >;
    const aiProxy = {
      postJsonToAgent: jest.fn().mockResolvedValue({ targets: [], count: 0 }),
    } as unknown as import("src/models/ai-proxy/ai-proxy.service").AiProxyService;

    const svc = new StartEncounterFromNarrativeService(
      sceneRepo,
      npcRepo,
      monsterRepo,
      partRepo,
      sessionRepo,
      messageRepo,
      encounterSvc,
      makeCombatService(),
      makeDiceService(),
      npcSvc,
      sceneCtxSvc,
      makeEventBus(),
      new EventEnvelopeFactory(undefined),
      aiProxy,
    );

    const result = await svc.run({
      sessionId: SESSION_ID,
      // sem sceneId
      targetNpcIds: [NPC_ID_OK],
      ownerUserId: OWNER_USER_ID,
    });

    expect(result.encounterId).toBe(ENCOUNTER_ID);
    // Não criou stub — usou active
    expect((sceneRepo.save as jest.Mock)).not.toHaveBeenCalled();
  });

  it("sceneId omitido + sem active → cria stub auto", async () => {
    const sceneRepo = makeSceneRepo(null, null); // nenhuma active
    const npcRepo = makeNpcRepo({
      [NPC_ID_OK]: {
        id: NPC_ID_OK,
        name: "Goblin",
        monsterId: MONSTER_ID,
        monster: {
          id: MONSTER_ID,
          name: "Goblin",
          hit_points: 7,
          hit_points_roll: "2d6",
          dexterity: 14,
        } as any,
      },
    });
    const monsterRepo = makeMonsterRepo({
      id: MONSTER_ID,
      hit_points: 7,
      hit_points_roll: "2d6",
      dexterity: 14,
    });
    const partRepo = makeParticipantRepo();
    const sessionRepo = makeSessionRepo({ id: SESSION_ID, campaignId: CAMPAIGN_ID });
    savedParticipants = [];
    const encounterSvc = makeEncounterService([]);
    const npcSvc = {
      materializeStubFromName: jest.fn(),
      findByNameInCampaign: jest.fn(),
    } as unknown as import("src/models/world/services/npc.service").NpcService;
    const sceneCtxSvc = {
      assembleContext: jest.fn().mockResolvedValue({
        scene: {},
        npcsPresent: [],
        recentEvents: [],
        partyKnowledge: [],
        locationChain: [],
        recentChronicles: [],
      }),
    } as unknown as import("src/models/session/services/scene-context.service").SceneContextService;

    const messageRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    } as unknown as import("typeorm").Repository<
      import("src/entities/session-message.entity").SessionMessageEntity
    >;
    const aiProxy = {
      postJsonToAgent: jest.fn().mockResolvedValue({ targets: [], count: 0 }),
    } as unknown as import("src/models/ai-proxy/ai-proxy.service").AiProxyService;

    const svc = new StartEncounterFromNarrativeService(
      sceneRepo,
      npcRepo,
      monsterRepo,
      partRepo,
      sessionRepo,
      messageRepo,
      encounterSvc,
      makeCombatService(),
      makeDiceService(),
      npcSvc,
      sceneCtxSvc,
      makeEventBus(),
      new EventEnvelopeFactory(undefined),
      aiProxy,
    );

    const result = await svc.run({
      sessionId: SESSION_ID,
      targetNpcIds: [NPC_ID_OK],
      narrativeTrigger: "Combate em câmara",
      ownerUserId: OWNER_USER_ID,
    });

    expect(result.encounterId).toBe(ENCOUNTER_ID);
    expect(sceneRepo.save).toHaveBeenCalled();
    const savedArg = (sceneRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedArg.sessionId).toBe(SESSION_ID);
    expect(savedArg.isActive).toBe(true);
    expect(savedArg.title).toBe("Combate em câmara");
  });

  it("targets vazios → chama agno extract-combat-targets e usa npcIds devolvidos", async () => {
    const { svc, aiProxy, messageRepo } = build();
    (messageRepo.find as jest.Mock).mockResolvedValueOnce([
      { content: "Cinco homens ao redor do fogo. Um sexto se aproxima.", sequenceNumber: 10 },
    ]);
    // Agno devolve os IDs já materializados
    (aiProxy.postJsonToAgent as jest.Mock).mockResolvedValueOnce({
      targets: [{ npcId: NPC_ID_OK, name: "Homem das listras" }],
      count: 1,
    });

    const result = await svc.run({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      campaignId: CAMPAIGN_ID,
      narrativeTrigger: "Sacar arma",
      ownerUserId: OWNER_USER_ID,
    });

    expect(result.encounterId).toBe(ENCOUNTER_ID);
    expect(aiProxy.postJsonToAgent).toHaveBeenCalledWith(
      "/narrative/extract-combat-targets",
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        sessionId: SESSION_ID,
        narrativeTrigger: "Sacar arma",
        recentProse: expect.stringContaining("homens ao redor do fogo"),
      }),
      expect.objectContaining({ userId: OWNER_USER_ID }),
    );
  });

  it("targets vazios + agno falha → ENCOUNTER_NO_TARGETS_IN_SCENE limpo", async () => {
    const { svc, aiProxy, messageRepo } = build();
    (messageRepo.find as jest.Mock).mockResolvedValueOnce([
      { content: "uma cena qualquer", sequenceNumber: 1 },
    ]);
    (aiProxy.postJsonToAgent as jest.Mock).mockRejectedValueOnce(new Error("agno down"));

    await expect(
      svc.run({
        sessionId: SESSION_ID,
        sceneId: SCENE_ID,
        campaignId: CAMPAIGN_ID,
        narrativeTrigger: "Sacar arma",
        ownerUserId: OWNER_USER_ID,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ENCOUNTER_NO_TARGETS_IN_SCENE });
  });

  it("targets vazios + sem prosa recente → não chama agno, falha 422", async () => {
    const { svc, aiProxy } = build(); // messageRepo default retorna []
    await expect(
      svc.run({
        sessionId: SESSION_ID,
        sceneId: SCENE_ID,
        campaignId: CAMPAIGN_ID,
        narrativeTrigger: "Sacar arma",
        ownerUserId: OWNER_USER_ID,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ENCOUNTER_NO_TARGETS_IN_SCENE });
    expect(aiProxy.postJsonToAgent).not.toHaveBeenCalled();
  });

  it("emite EncounterEvent.encounter_started no event bus", async () => {
    const { svc, bus } = build();
    await svc.run({
      sessionId: SESSION_ID,
      sceneId: SCENE_ID,
      targetNpcIds: [NPC_ID_OK],
      narrativeTrigger: "Goblins emboscam o party",
      campaignId: CAMPAIGN_ID,
      ownerUserId: OWNER_USER_ID,
    });
    expect(bus.publish).toHaveBeenCalled();
    const envelope = (bus.publish as jest.Mock).mock.calls[0][0];
    expect(envelope.eventCategory).toBe("EncounterEvent");
    expect(envelope.eventType).toBe("encounter_started");
    expect(envelope.scope.campaignId).toBe(CAMPAIGN_ID);
    expect(envelope.scope.encounterId).toBe(ENCOUNTER_ID);
    expect(envelope.payload.triggerSource).toBe("narrative");
  });
});
