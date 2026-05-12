import { EncounterService } from "../encounter.service";

describe("EncounterService — NPC state sync", () => {
  const ENCOUNTER_ID = "enc-1";
  const SESSION_ID = "ses-1";

  function setup() {
    const defeatedNpc = {
      id: "part-vitorino",
      encounterId: ENCOUNTER_ID,
      type: "npc",
      faction: "enemy",
      displayName: "Vitorino",
      currentHp: 0,
      maxHp: 5,
      isDefeated: true,
      monster: { slug: "commoner" },
    };
    const encounter = {
      id: ENCOUNTER_ID,
      sessionId: SESSION_ID,
      name: "Emboscada na taberna",
      status: "active",
      currentRound: 1,
      participants: [defeatedNpc],
    };
    const npcState = {
      id: "state-vitorino",
      gameSessionId: SESSION_ID,
      npcId: "npc-vitorino",
      npc: { id: "npc-vitorino", name: "Vitorino" },
      status: "alive",
      disposition: "hostile",
    };

    const encounterRepo = {
      findOne: jest.fn().mockResolvedValue(encounter),
      save: jest.fn(async (value) => value),
    };
    const participantRepo = {
      find: jest.fn().mockResolvedValue([defeatedNpc]),
    };
    const npcStateRepo = {
      find: jest.fn().mockResolvedValue([npcState]),
      save: jest.fn(async (value) => value),
    };
    const eventService = { emit: jest.fn() };
    const sessionService = {
      getById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        campaignId: "cmp-1",
        ownerId: "user-1",
      }),
      setActiveEncounter: jest.fn(),
    };
    const gameClockService = { advanceTime: jest.fn() };
    const sessionMessageService = { append: jest.fn() };
    const sceneContextCache = { invalidateAll: jest.fn() };

    const service = new EncounterService(
      encounterRepo as any,
      participantRepo as any,
      {} as any,
      {} as any,
      npcStateRepo as any,
      {} as any,
      eventService as any,
      sessionService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      gameClockService as any,
      sessionMessageService as any,
      sceneContextCache as any,
    );

    return { service, npcState, npcStateRepo, sceneContextCache };
  }

  it("marca NPC derrotado como dead no estado da sessão ao resolver encounter", async () => {
    const { service, npcState, npcStateRepo, sceneContextCache } = setup();

    await service.resolveEncounter(
      ENCOUNTER_ID,
      { outcome: "victory" },
      "system",
    );

    expect(npcState.status).toBe("dead");
    expect(npcStateRepo.save).toHaveBeenCalledWith([npcState]);
    expect(sceneContextCache.invalidateAll).toHaveBeenCalledTimes(1);
  });
});
