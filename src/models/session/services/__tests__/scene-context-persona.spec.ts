import { Repository } from "typeorm";
import {
  SceneEntity,
  SceneNpcEntity,
  LocationEntity,
  LocationPoiEntity,
  LocationConnectionEntity,
  CampaignEntity,
  GameSessionEntity,
  StoryArcEntity,
  NpcEntity,
  NpcRelationshipEntity,
  QuestEntity,
  SessionNpcStateEntity,
  SessionStoryArcStateEntity,
} from "src/entities";
import { SceneContextService } from "../scene-context.service";
import { SceneContextCacheService } from "../scene-context-cache.service";
import { EventLogService } from "../event-log.service";
import { ChronicleService } from "../chronicle.service";
import { PcPersonaService } from "src/models/characters/services/pc-persona.service";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const SCENE_ID = "44444444-4444-4444-8444-444444444444";
const CHARACTER_ID = "55555555-5555-4555-8555-555555555555";

function buildService(opts: {
  scene?: SceneEntity | null;
  session?: GameSessionEntity | null;
  sceneNpcs?: SceneNpcEntity[];
  npcStates?: SessionNpcStateEntity[];
  personaThrows?: boolean;
}): {
  service: SceneContextService;
  personaMock: jest.Mock;
} {
  const sceneRepo = {
    findOne: jest.fn().mockResolvedValue(opts.scene ?? null),
  };
  const sceneNpcRepo = {
    find: jest.fn().mockResolvedValue(opts.sceneNpcs ?? []),
  };
  const locationRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const poiRepo = { find: jest.fn().mockResolvedValue([]) };
  const connectionRepo = { find: jest.fn().mockResolvedValue([]) };
  const campaignRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const sessionRepo = {
    findOne: jest.fn().mockResolvedValue(opts.session ?? null),
  };
  const arcRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const npcRepo = {} as unknown as Repository<NpcEntity>;
  const relRepo = {} as unknown as Repository<NpcRelationshipEntity>;
  const questRepo = {} as unknown as Repository<QuestEntity>;
  const npcStateRepo = {
    find: jest.fn().mockResolvedValue(opts.npcStates ?? []),
  } as unknown as Repository<SessionNpcStateEntity>;
  const arcStateRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as Repository<SessionStoryArcStateEntity>;

  const eventLog = {
    getRecentEvents: jest.fn().mockResolvedValue([]),
  } as unknown as EventLogService;
  const chronicle = {
    getRelevantKnowledge: jest.fn().mockResolvedValue([]),
    getChronicles: jest.fn().mockResolvedValue([]),
  } as unknown as ChronicleService;

  const personaMock = jest.fn();
  if (opts.personaThrows) {
    personaMock.mockRejectedValue(new Error("persona failure"));
  } else {
    personaMock.mockResolvedValue({
      characterId: CHARACTER_ID,
      name: "Aelara",
      race: "Tiefling",
      subrace: null,
      class: "Paladino",
      subclass: null,
      level: 3,
      background: "Soldado",
      alignment: "lawful-good",
      personality: { bond: "Vingar Tobias" },
      currentHpPercent: 56,
      conditionsActive: ["frightened"],
      keyEquipmentSummary: [],
    });
  }
  const persona = {
    assemblePersona: personaMock,
  } as unknown as PcPersonaService;

  const cache = new SceneContextCacheService();
  const movementLockService = {
    normalize: jest.fn((value: unknown) => value ?? null),
  };
  const service = new SceneContextService(
    sceneRepo as unknown as Repository<SceneEntity>,
    sceneNpcRepo as unknown as Repository<SceneNpcEntity>,
    locationRepo as unknown as Repository<LocationEntity>,
    poiRepo as unknown as Repository<LocationPoiEntity>,
    connectionRepo as unknown as Repository<LocationConnectionEntity>,
    campaignRepo as unknown as Repository<CampaignEntity>,
    sessionRepo as unknown as Repository<GameSessionEntity>,
    arcRepo as unknown as Repository<StoryArcEntity>,
    npcRepo,
    relRepo,
    questRepo,
    npcStateRepo,
    arcStateRepo,
    eventLog,
    chronicle,
    persona,
    cache,
    movementLockService as any,
  );

  return { service, personaMock };
}

function makeScene(): SceneEntity {
  return {
    id: SCENE_ID,
    sessionId: SESSION_ID,
    title: "Praça de Phandalin",
    description: "",
    mood: "tense",
    location: null,
    locationId: undefined,
  } as unknown as SceneEntity;
}

function makeSession(characterIds: string[]): GameSessionEntity {
  return {
    id: SESSION_ID,
    characterIds,
  } as unknown as GameSessionEntity;
}

function makeNpc(id: string, name: string): NpcEntity {
  return {
    id,
    name,
    title: undefined,
    race: "Humano",
    personalityBig5: {},
    knowledgeScope: [],
  } as unknown as NpcEntity;
}

function makeSceneNpc(
  npc: NpcEntity,
  presenceRole: "present" | "interlocutor" | "companion" = "present",
): SceneNpcEntity {
  return {
    sceneId: SCENE_ID,
    npcId: npc.id,
    npc,
    presenceRole,
  } as unknown as SceneNpcEntity;
}

function makeNpcState(
  npc: NpcEntity,
  status: "alive" | "dead" | "missing" | "unknown",
): SessionNpcStateEntity {
  return {
    gameSessionId: SESSION_ID,
    npcId: npc.id,
    npc,
    status,
    disposition: "neutral",
    currentPoiId: undefined,
  } as unknown as SessionNpcStateEntity;
}

describe("SceneContextService — playerCharacter injection (Spec 018)", () => {
  it("injeta playerCharacter quando session tem 1 PC associado", async () => {
    const { service, personaMock } = buildService({
      scene: makeScene(),
      session: makeSession([CHARACTER_ID]),
    });

    const ctx = await service.assembleContext(SCENE_ID);
    expect(personaMock).toHaveBeenCalledWith(CHARACTER_ID, null);
    expect(ctx.playerCharacter).not.toBeNull();
    expect(ctx.playerCharacter!.characterId).toBe(CHARACTER_ID);
    expect(ctx.playerCharacter!.race).toBe("Tiefling");
  });

  it("playerCharacter=null quando session multi-PC (V1 só solo)", async () => {
    const { service, personaMock } = buildService({
      scene: makeScene(),
      session: makeSession([CHARACTER_ID, "another-pc"]),
    });

    const ctx = await service.assembleContext(SCENE_ID);
    expect(personaMock).not.toHaveBeenCalled();
    expect(ctx.playerCharacter).toBeNull();
  });

  it("playerCharacter=null quando session sem PCs", async () => {
    const { service, personaMock } = buildService({
      scene: makeScene(),
      session: makeSession([]),
    });

    const ctx = await service.assembleContext(SCENE_ID);
    expect(personaMock).not.toHaveBeenCalled();
    expect(ctx.playerCharacter).toBeNull();
  });

  it("playerCharacter=null se assemblePersona falhar (não derruba context)", async () => {
    const { service } = buildService({
      scene: makeScene(),
      session: makeSession([CHARACTER_ID]),
      personaThrows: true,
    });

    const ctx = await service.assembleContext(SCENE_ID);
    expect(ctx.playerCharacter).toBeNull();
    expect(ctx.scene.title).toBe("Praça de Phandalin");
  });

  it("emptyContext (scene não encontrada) retorna playerCharacter=null", async () => {
    const { service } = buildService({ scene: null });
    const ctx = await service.assembleContext(SCENE_ID);
    expect(ctx.playerCharacter).toBeNull();
  });

  it("não injeta NPC morto como presente ou interlocutor", async () => {
    const deadNpc = makeNpc("npc-dead", "Vitorino");
    const aliveNpc = makeNpc("npc-alive", "Gaudério");
    const scene = {
      ...makeScene(),
      currentInterlocutorNpc: deadNpc,
    } as unknown as SceneEntity;
    const { service } = buildService({
      scene,
      session: makeSession([CHARACTER_ID]),
      sceneNpcs: [
        makeSceneNpc(deadNpc, "interlocutor"),
        makeSceneNpc(aliveNpc, "present"),
      ],
      npcStates: [
        makeNpcState(deadNpc, "dead"),
        makeNpcState(aliveNpc, "alive"),
      ],
    });

    const ctx = await service.assembleContext(SCENE_ID);

    expect(ctx.npcsPresent.map((npc) => npc.name)).toEqual(["Gaudério"]);
    expect(ctx.stage.npcsPresent.map((npc) => npc.name)).toEqual(["Gaudério"]);
    expect(ctx.stage.currentInterlocutor).toBeNull();
  });
});
