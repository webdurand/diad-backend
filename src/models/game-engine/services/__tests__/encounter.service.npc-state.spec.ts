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
      controlledBy: "ai",
      displayName: "Vitorino",
      currentHp: 0,
      maxHp: 5,
      isDefeated: true,
      monster: { slug: "commoner", xp: 10 },
    };
    const pcParticipant = {
      id: "part-aric",
      encounterId: ENCOUNTER_ID,
      type: "pc",
      faction: "ally",
      controlledBy: "pc",
      displayName: "Aric",
      isDefeated: false,
    };
    const encounter = {
      id: ENCOUNTER_ID,
      sessionId: SESSION_ID,
      name: "Emboscada na taberna",
      status: "active",
      currentRound: 1,
      participants: [defeatedNpc, pcParticipant],
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
      update: jest.fn(),
    };
    const participantRepo = {
      find: jest.fn().mockResolvedValue([defeatedNpc, pcParticipant]),
      save: jest.fn(async (value) => value),
    };
    const npcStateRepo = {
      find: jest.fn().mockResolvedValue([npcState]),
      save: jest.fn(async (value) => value),
    };
    const eventService = {
      emit: jest.fn(),
      getEncounterTimeline: jest.fn().mockResolvedValue([
        {
          eventType: "damage_applied",
          actorParticipantId: "part-aric",
          targetParticipantId: "part-vitorino",
          data: { finalDamage: 7 },
        },
      ]),
    };
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
    const diceService = {
      rollInitiative: jest.fn().mockReturnValue({
        roll: 10,
        modifier: 0,
        total: 10,
      }),
    };
    const stateService = {
      restoreQuickPlaySnapshot: jest.fn().mockResolvedValue(undefined),
    };

    const service = new EncounterService(
      encounterRepo as any,
      participantRepo as any,
      {} as any,
      {} as any,
      {} as any,
      npcStateRepo as any,
      diceService as any,
      eventService as any,
      sessionService as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      gameClockService as any,
      sessionMessageService as any,
      sceneContextCache as any,
    );

    return {
      service,
      npcState,
      npcStateRepo,
      sceneContextCache,
      encounterRepo,
      participantRepo,
      defeatedNpc,
      eventService,
      sessionMessageService,
      stateService,
      encounter,
    };
  }

  it("aceita inimigo controlado pelo mestre ao rolar iniciativa", async () => {
    const {
      service,
      participantRepo,
      defeatedNpc,
      encounterRepo,
    } = setup();
    defeatedNpc.controlledBy = "dm";
    defeatedNpc.currentHp = 5;
    defeatedNpc.isDefeated = false;

    const result = await service.rollAllInitiative(ENCOUNTER_ID);

    expect(result).toHaveLength(2);
    expect(participantRepo.save).toHaveBeenCalled();
    expect(encounterRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ["participants"],
      }),
    );
  });

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

  it("inclui defeatedNpcIds/nomes no encounter_resolved e gera digest 'system' no transcript", async () => {
    const { service, eventService, sessionMessageService } = setup();

    await service.resolveEncounter(
      ENCOUNTER_ID,
      { outcome: "victory" },
      "system",
    );

    expect(eventService.emit).toHaveBeenCalledWith(
      SESSION_ID,
      ENCOUNTER_ID,
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "encounter_resolved",
          data: expect.objectContaining({
            defeatedNpcIds: ["part-vitorino"],
            defeatedNpcNames: ["Vitorino"],
          }),
        }),
      ]),
    );

    expect(sessionMessageService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        userId: "user-1",
        kind: "system",
        clientId: `srv-combat-digest-${ENCOUNTER_ID}`,
        content: expect.stringContaining("Vitorino"),
      }),
    );
    const digestCall = sessionMessageService.append.mock.calls.find(
      ([dto]: any[]) => dto.kind === "system",
    );
    expect(digestCall[0].content).toContain("vitória");
    expect(digestCall[0].content).toContain(
      "Aric desferiu o golpe final em Vitorino (7 de dano)",
    );
  });

  it("endEncounter carrega participants.monster e soma XP do monstro (regressão XP=0)", async () => {
    const { service, encounterRepo, eventService, sessionMessageService } =
      setup();

    const result = await service.endEncounter(ENCOUNTER_ID);

    expect(encounterRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ["participants", "participants.monster"],
      }),
    );
    expect(result.totalXp).toBe(10);
    expect(result.xpPerCharacter).toBe(10);

    expect(eventService.emit).toHaveBeenCalledWith(
      SESSION_ID,
      ENCOUNTER_ID,
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "encounter_end",
          data: expect.objectContaining({
            totalXp: 10,
            xpPerCharacter: 10,
            monstersDefeated: 1,
            defeatedNpcIds: ["part-vitorino"],
            defeatedNpcNames: ["Vitorino"],
          }),
        }),
      ]),
    );

    expect(sessionMessageService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "system",
        clientId: `srv-combat-digest-${ENCOUNTER_ID}`,
        content: expect.stringContaining("10 XP"),
      }),
    );
  });

  it("resume o PV atual da ficha e lista todos os inimigos sem truncamento silencioso", async () => {
    const pcParticipant = {
      id: "part-aric",
      encounterId: ENCOUNTER_ID,
      type: "pc",
      faction: "ally",
      controlledBy: "pc",
      characterId: "char-aric",
      displayName: "Aric",
      currentHp: 129,
      maxHp: 129,
      isDefeated: false,
    };
    const defeatedNpcs = ["Goblin", "Troll 1", "Troll 3", "Troll 2"].map(
      (displayName, index) => ({
        id: `part-enemy-${index}`,
        encounterId: ENCOUNTER_ID,
        type: "monster",
        faction: "enemy",
        controlledBy: "ai",
        displayName,
        currentHp: 0,
        maxHp: 5,
        isDefeated: true,
        monster: { slug: displayName.toLowerCase().replaceAll(" ", "-") },
      }),
    );
    const participantRepo = {
      find: jest.fn().mockResolvedValue([...defeatedNpcs, pcParticipant]),
    };
    const characterRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "char-aric",
        userId: "user-1",
      }),
    };
    const sheetService = {
      computeSheet: jest.fn().mockResolvedValue({
        currentHp: 3,
        maxHp: 129,
      }),
    };
    const service = new EncounterService(
      {} as any,
      participantRepo as any,
      {} as any,
      characterRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      sheetService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const outcome = await (service as any).buildEncounterOutcomeSummary(
      { id: ENCOUNTER_ID },
      "victory",
      [],
      [],
      [],
    );

    expect(sheetService.computeSheet).toHaveBeenCalledWith(
      "user-1",
      "char-aric",
    );
    expect(outcome.pcFinalHp).toEqual(
      expect.objectContaining({
        current: 3,
        max: 129,
        percent: 2,
      }),
    );
    expect(outcome.summary).toContain(
      "Goblin, Troll 1, Troll 3 e Troll 2",
    );
    expect(outcome.summary).toContain("PC 2%HP");
  });

  it("restaura o snapshot de Quick Play uma única vez", async () => {
    const { service, encounter, stateService, encounterRepo } = setup();
    const snapshot = {
      current_hp: 3,
      temp_hp: 7,
      death_saves_success: 1,
      death_saves_fail: 2,
      conditions: ["poisoned"],
      spell_slots_used: { "5": 3 },
      hit_dice_used: { d8: 4 },
      ki_points_used: 2,
      feature_uses_used: { "wild-shape": 1 },
      exhaustion_level: 1,
      inspiration: true,
    };
    encounter.mapData = {
      quickPlay: {
        characterId: "char-aric",
        characterStateSnapshot: snapshot,
        restored: false,
      },
    };

    await (service as any).restoreQuickPlayCharacterState(encounter);
    await (service as any).restoreQuickPlayCharacterState(encounter);

    expect(stateService.restoreQuickPlaySnapshot).toHaveBeenCalledTimes(1);
    expect(stateService.restoreQuickPlaySnapshot).toHaveBeenCalledWith(
      "char-aric",
      snapshot,
    );
    expect(encounterRepo.update).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      expect.objectContaining({
        mapData: expect.objectContaining({
          quickPlay: expect.objectContaining({ restored: true }),
        }),
      }),
    );
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
