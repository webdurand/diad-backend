import { Repository } from "typeorm";
import { MonsterEntity } from "src/entities/monster.entity";
import { NpcService } from "src/models/world/services/npc.service";
import { StartEncounterFromNarrativeService } from "../start-encounter-from-narrative.service";
import { RandomEncounterMaterializerService } from "../random-encounter-materializer.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENE = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";

const GOBLIN: MonsterEntity = {
  id: "monster-goblin",
  slug: "goblin",
  name: "Goblin",
} as MonsterEntity;

const WOLF: MonsterEntity = {
  id: "monster-wolf",
  slug: "wolf",
  name: "Wolf",
} as MonsterEntity;

function makeMonsterRepo(items: MonsterEntity[]): Repository<MonsterEntity> {
  return {
    findOne: jest.fn(async ({ where }: { where: { slug: string } }) => {
      return items.find((m) => m.slug === where.slug) ?? null;
    }),
  } as unknown as Repository<MonsterEntity>;
}

function makeNpcService(): NpcService {
  let counter = 0;
  return {
    create: jest.fn(async (campaignId: string, dto: { name: string }) => {
      counter++;
      return {
        id: `npc-${counter}`,
        name: dto.name,
        campaignId,
      };
    }),
  } as unknown as NpcService;
}

function makeStartEncounter(): StartEncounterFromNarrativeService {
  return {
    run: jest.fn(async () => ({
      encounterId: "encounter-123",
      participantIds: ["p1", "p2"],
      turnOrder: ["p1", "p2"],
      currentParticipantId: "p1",
      round: 1,
      surprised: [],
    })),
  } as unknown as StartEncounterFromNarrativeService;
}

function makeBus(): EventBusService {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

describe("RandomEncounterMaterializerService", () => {
  it("cria 1 NpcEntity por slug e chama StartEncounter com targetNpcIds", async () => {
    const npcService = makeNpcService();
    const startEnc = makeStartEncounter();
    const svc = new RandomEncounterMaterializerService(
      makeMonsterRepo([GOBLIN, WOLF]),
      npcService,
      startEnc,
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );

    const result = await svc.materialize({
      campaignId: CAMPAIGN,
      sessionId: SESSION,
      sceneId: SCENE,
      monsterSlugs: ["goblin", "goblin", "goblin", "wolf"],
      ownerUserId: OWNER,
      partyAvgLevel: 3,
      difficulty: "moderate",
      biome: "forest",
    });

    expect(npcService.create).toHaveBeenCalledTimes(4);
    expect(result.encounterId).toBe("encounter-123");
    expect(startEnc.run).toHaveBeenCalledTimes(1);

    const callArgs = (startEnc.run as jest.Mock).mock.calls[0][0];
    expect(callArgs.targetNpcIds).toHaveLength(4);
    expect(callArgs.sessionId).toBe(SESSION);
    expect(callArgs.sceneId).toBe(SCENE);
    expect(callArgs.campaignId).toBe(CAMPAIGN);
  });

  it("cada NPC criado aponta pro monsterId correto", async () => {
    const npcService = makeNpcService();
    const svc = new RandomEncounterMaterializerService(
      makeMonsterRepo([GOBLIN, WOLF]),
      npcService,
      makeStartEncounter(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );

    await svc.materialize({
      campaignId: CAMPAIGN,
      sessionId: SESSION,
      sceneId: SCENE,
      monsterSlugs: ["goblin", "wolf"],
      ownerUserId: OWNER,
      partyAvgLevel: 3,
      difficulty: "moderate",
    });

    const calls = (npcService.create as jest.Mock).mock.calls;
    expect(calls[0][1].monsterId).toBe("monster-goblin");
    expect(calls[0][1].name).toBe("Goblin");
    expect(calls[0][1].initialDisposition).toBe("hostile");
    expect(calls[1][1].monsterId).toBe("monster-wolf");
    expect(calls[1][1].name).toBe("Wolf");
  });

  it("emite EncounterEvent.random_encounter_started com payload completo", async () => {
    const bus = makeBus();
    const svc = new RandomEncounterMaterializerService(
      makeMonsterRepo([GOBLIN]),
      makeNpcService(),
      makeStartEncounter(),
      bus,
      new EventEnvelopeFactory(undefined),
    );

    await svc.materialize({
      campaignId: CAMPAIGN,
      sessionId: SESSION,
      sceneId: SCENE,
      monsterSlugs: ["goblin", "goblin"],
      ownerUserId: OWNER,
      partyAvgLevel: 3,
      difficulty: "high",
      biome: "forest",
      reasonChain: ["chaos=7", "rolled=10% < 12%"],
    });

    expect(bus.publish).toHaveBeenCalled();
    const envelope = (bus.publish as jest.Mock).mock.calls[0][0];
    expect(envelope.eventCategory).toBe("EncounterEvent");
    expect(envelope.eventType).toBe("random_encounter_started");
    expect(envelope.payload.monsterSlugs).toEqual(["goblin", "goblin"]);
    expect(envelope.payload.biome).toBe("forest");
    expect(envelope.payload.difficulty).toBe("high");
    expect(envelope.payload.encounterId).toBe("encounter-123");
  });

  it("levanta erro se algum slug não existe no catálogo", async () => {
    const svc = new RandomEncounterMaterializerService(
      makeMonsterRepo([GOBLIN]),
      makeNpcService(),
      makeStartEncounter(),
      makeBus(),
      new EventEnvelopeFactory(undefined),
    );

    await expect(
      svc.materialize({
        campaignId: CAMPAIGN,
        sessionId: SESSION,
        sceneId: SCENE,
        monsterSlugs: ["goblin", "tarrasque-fake"],
        ownerUserId: OWNER,
        partyAvgLevel: 3,
        difficulty: "moderate",
      }),
    ).rejects.toThrow();
  });
});
