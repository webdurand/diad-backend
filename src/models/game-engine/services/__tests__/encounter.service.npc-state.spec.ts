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

  it("auto-inclui companions ativos como participantes pc aliados", async () => {
    const savedParticipants: any[] = [];
    const encounter = {
      id: ENCOUNTER_ID,
      sessionId: SESSION_ID,
      name: "Emboscada",
      status: "preparing",
      participants: savedParticipants,
    };
    const encounterRepo = {
      create: jest.fn((value) => ({ ...value, id: ENCOUNTER_ID })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn().mockResolvedValue(encounter),
    };
    const participantRepo = {
      create: jest.fn((value) => ({
        ...value,
        id: `part-${value.characterId}`,
      })),
      save: jest.fn(async (value) => {
        savedParticipants.push(value);
        return value;
      }),
    };
    const characterRepo = {
      findOne: jest.fn(async ({ where }: any) => ({
        id: where.id,
        userId: "user-1",
      })),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: "char-pc", userId: "user-1", ownerType: "pc" },
          {
            id: "char-comp",
            userId: "user-1",
            ownerType: "companion",
            companionTemplateId: "tpl-1",
          },
        ]),
      })),
    };
    const partyMemberRepo = {
      find: jest.fn().mockResolvedValue([
        {
          ownerCharacterId: "char-pc",
          companionCharacterId: "char-comp",
          state: "active",
        },
      ]),
    };
    const sessionService = {
      getById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        campaignId: "cmp-1",
        ownerId: "user-1",
        characterIds: ["char-pc"],
      }),
      setActiveEncounter: jest.fn(),
    };
    const campaignService = {
      getPlayers: jest.fn().mockResolvedValue([
        {
          userId: "user-1",
          characterId: "char-pc",
          isActive: true,
        },
      ]),
    };
    const sheetService = {
      computeSheet: jest.fn(async (_userId: string, characterId: string) => ({
        name: characterId === "char-comp" ? "Sable" : "Aric",
        initiative: characterId === "char-comp" ? 4 : 2,
        currentHp: 10,
        maxHp: 10,
        tempHp: 0,
        armorClass: 14,
        speed: 30,
        deathSaves: { successes: 0, failures: 0 },
        spellSlots: [],
      })),
    };
    const stateService = { getInspiration: jest.fn().mockResolvedValue(false) };

    const service = new EncounterService(
      encounterRepo as any,
      participantRepo as any,
      {} as any,
      characterRepo as any,
      partyMemberRepo as any,
      {} as any,
      {} as any,
      {} as any,
      sessionService as any,
      sheetService as any,
      stateService as any,
      {} as any,
      campaignService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.create(SESSION_ID, { name: "Emboscada" }, "user-1");

    expect(partyMemberRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: "cmp-1",
          state: "active",
        }),
      }),
    );
    expect(savedParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "pc",
          characterId: "char-comp",
          displayName: "Sable",
          faction: "ally",
          controlledBy: "pc",
        }),
      ]),
    );
  });
});
