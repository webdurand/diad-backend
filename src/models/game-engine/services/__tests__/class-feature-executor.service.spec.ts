import { ClassFeatureExecutorService } from "../class-feature-executor.service";
import { DiceService } from "../dice.service";
import type { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";

function makeEncounter(): EncounterEntity {
  return {
    id: "enc-1",
    status: "active",
    turnOrder: ["paladin"],
    currentTurnIndex: 0,
    currentRound: 1,
    sessionId: "session-1",
  } as EncounterEntity;
}

function makeParticipant(
  id: string,
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id,
    displayName: id,
    type: "pc",
    faction: "ally",
    characterId: `char-${id}`,
    currentHp: 5,
    maxHp: 10,
    conditions: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionsUsed: 0,
    ...overrides,
  } as EncounterParticipantEntity;
}

function makeService() {
  const encounter = makeEncounter();
  const paladin = makeParticipant("paladin", {
    characterId: "char-paladin",
    currentHp: 20,
    maxHp: 20,
  });
  const target = makeParticipant("target", {
    characterId: "char-target",
    currentHp: 5,
    maxHp: 12,
  });
  const rogue = makeParticipant("rogue", {
    characterId: "char-rogue",
    movementRemaining: 30,
  });
  const fighter = makeParticipant("fighter", {
    characterId: "char-fighter",
    currentHp: 12,
    maxHp: 12,
  });
  const druid = makeParticipant("druid", {
    characterId: "char-druid",
    effectInstances: [],
  });
  const orc = makeParticipant("orc", {
    characterId: "char-orc",
    currentHp: 0,
    dyingState: "dying",
    isDefeated: false,
    effectInstances: [
      {
        id: "relentless-pending",
        kind: "relentless_endurance_pending",
        sourceFeatureSlug: "relentless-endurance",
        sourceCasterParticipantId: "orc",
        payload: { triggerEventId: "relentless-trigger" },
        expiresAt: { kind: "until_consumed" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      },
    ],
  });
  const participants: Record<string, EncounterParticipantEntity> = {
    paladin,
    target,
    rogue,
    fighter,
    druid,
    orc,
  };
  const orcState = {
    id: "state-orc",
    character_id: "char-orc",
    current_hp: 0,
    temp_hp: 0,
    max_hp_bonus: 0,
    death_saves_success: 0,
    death_saves_fail: 0,
    conditions: ["dying", "unconscious"],
    feature_uses_used: {},
  } as CharacterStateEntity;
  const encounterRepo = {
    findOne: jest.fn().mockResolvedValue(encounter),
  };
  const participantRepo = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if ("id" in where) return participants[where.id as string] ?? null;
      return null;
    }),
    save: jest.fn(async (p: EncounterParticipantEntity) => {
      participants[p.id] = p;
      return p;
    }),
  };
  const stateRepo = {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        where.character_id === orcState.character_id ? orcState : null,
    ),
    save: jest.fn(async (state: CharacterStateEntity) => state),
  };
  const transactionManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === EncounterParticipantEntity) return participantRepo;
      if (entity === CharacterStateEntity) return stateRepo;
      throw new Error("Unexpected transaction repository");
    }),
  };
  let transactionTail = Promise.resolve();
  const transaction = jest.fn(
    async <T>(
      callback: (manager: typeof transactionManager) => Promise<T>,
    ): Promise<T> => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const participantSnapshots = new Map(
        Object.entries(participants).map(([id, participant]) => [
          id,
          structuredClone(participant),
        ]),
      );
      const stateSnapshot = structuredClone(orcState);
      try {
        return await callback(transactionManager);
      } catch (error) {
        for (const [id, snapshot] of participantSnapshots) {
          const participant = participants[id];
          for (const key of Object.keys(participant)) {
            delete (participant as unknown as Record<string, unknown>)[key];
          }
          Object.assign(participant, snapshot);
        }
        for (const key of Object.keys(orcState)) {
          delete (orcState as unknown as Record<string, unknown>)[key];
        }
        Object.assign(orcState, stateSnapshot);
        throw error;
      } finally {
        release();
      }
    },
  );
  Object.assign(participantRepo, {
    manager: { transaction },
  });
  const encounterService = {
    getParticipant: jest.fn(async (id: string) => participants[id]),
  };
  const eventService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };
  const sheetService = {
    computeSheet: jest.fn(
      async (_ownerId: string, characterId: string) => ({
        classes: [
          {
            slug:
              characterId === "char-rogue"
                ? "rogue"
                : characterId === "char-fighter"
                  ? "fighter"
                  : characterId === "char-druid"
                    ? "druid"
                    : characterId === "char-orc"
                      ? "fighter"
                  : "paladin",
            level:
              characterId === "char-rogue"
                ? 10
                : characterId === "char-fighter"
                  ? 1
                  : characterId === "char-druid"
                  ? 20
                  : characterId === "char-orc"
                    ? 5
                  : 2,
          },
        ],
        race:
          characterId === "char-orc"
            ? { slug: "orc", name: "Orc" }
            : { slug: "human", name: "Human" },
        totalLevel: characterId === "char-orc" ? 5 : undefined,
        abilityScores: [],
        speed: 30,
        currentHp: characterId === "char-fighter" ? 10 : undefined,
        source: { code: "XPHB" },
      }),
    ),
  };
  const stateService = {
    getFeatureUsesUsed: jest.fn().mockResolvedValue({ "lay-on-hands": 0 }),
    getCurrentHp: jest.fn(async (characterId: string) =>
      characterId === "char-target"
        ? target.currentHp
        : characterId === "char-orc"
          ? orc.currentHp
          : null,
    ),
    incrementFeatureUses: jest.fn().mockResolvedValue(undefined),
    updateConditions: jest.fn().mockResolvedValue({ conditions: [] }),
    updateHp: jest.fn(
      async (
        _ownerId: string,
        characterId: string,
        update: { healing?: number },
      ) =>
        characterId === "char-target"
          ? {
              currentHp:
                target.currentHp + (update.healing ?? 0),
            }
          : { currentHp: 12 },
    ),
  };
  const genericActionsService = {
    execute: jest.fn(
      async (
        _encounterId: string,
        input: { participantId: string; kind: string },
      ) => {
        const participant = participants[input.participantId];
        if (input.kind === "dash") {
          participant.hasDashed = true;
          participant.movementRemaining = 60;
        }
        return { ok: true, value: {}, events: [] };
      },
    ),
  };
  const classFeatureResolver = {
    resolveInvocation: jest.fn().mockResolvedValue({
      resolved: true,
      events: [],
      resolutionPayload: {},
    }),
  };
  const conditionLifecycle = {
    removeConditionInstance: jest.fn().mockResolvedValue({
      events: [],
      removed: true,
    }),
    revalidateAfterHpChange: jest.fn().mockResolvedValue({
      events: [],
      removed: [],
    }),
  };
  const concentration = {
    break: jest.fn().mockResolvedValue({ events: [] }),
  };
  const svc = new ClassFeatureExecutorService(
    encounterRepo as never,
    participantRepo as never,
    encounterService as never,
    eventService as never,
    sheetService as never,
    stateService as never,
    new DiceService(),
    genericActionsService as never,
    classFeatureResolver as never,
    conditionLifecycle as never,
    { tryAutoEnd: jest.fn() } as never,
    concentration as never,
  );

  return {
    svc,
    paladin,
    rogue,
    fighter,
    druid,
    orc,
    orcState,
    encounter,
    target,
    eventService,
    stateService,
    genericActionsService,
    classFeatureResolver,
    concentration,
    participantRepo,
    stateRepo,
    transaction,
    transactionManager,
  };
}

describe("ClassFeatureExecutorService", () => {
  describe("lay-on-hands", () => {
    it("consome bonus action e preserva action ao curar", async () => {
      const { svc, paladin, target, stateService } = makeService();

      const result = await svc.execute(
        "enc-1",
        "paladin",
        "lay-on-hands",
        { targetParticipantId: "target", hpAmount: 4 },
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(paladin.actionUsed).toBe(false);
      expect(paladin.bonusActionUsed).toBe(true);
      expect(target.currentHp).toBe(9);
      expect(stateService.incrementFeatureUses).toHaveBeenCalledWith(
        "char-paladin",
        "lay-on-hands",
        4,
      );
    });

    it("persiste a remoção de condição também na ficha do alvo", async () => {
      const { svc, target, stateService } = makeService();
      target.conditions = ["poisoned"];

      const result = await svc.execute(
        "enc-1",
        "paladin",
        "lay-on-hands",
        {
          targetParticipantId: "target",
          hpAmount: 0,
          removeConditions: ["poisoned"],
        },
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(stateService.updateConditions).toHaveBeenCalledWith(
        "owner-1",
        "char-target",
        { conditions: [] },
      );
    });

    it("rejeita quando bonus action ja foi usada", async () => {
      const { svc, paladin } = makeService();
      paladin.bonusActionUsed = true;

      const result = await svc.execute(
        "enc-1",
        "paladin",
        "lay-on-hands",
        { targetParticipantId: "target", hpAmount: 4 },
        "owner-1",
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("BONUS_ACTION_ALREADY_USED");
    });
  });

  describe("cunning-action aliases", () => {
    it("traduz o botao de Disparada para a subacao sem gastar a acao", async () => {
      const { svc, rogue, encounter, genericActionsService } = makeService();
      encounter.turnOrder = ["rogue"];
      rogue.actionUsed = false;

      const result = await svc.execute(
        "enc-1",
        "rogue",
        "cunning-action-dash",
        {},
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(genericActionsService.execute).toHaveBeenCalledWith(
        "enc-1",
        expect.objectContaining({
          participantId: "rogue",
          kind: "dash",
        }),
      );
      expect(rogue.actionUsed).toBe(false);
      expect(rogue.bonusActionUsed).toBe(true);
      expect(rogue.hasDashed).toBe(true);
      expect(rogue.movementRemaining).toBe(60);
    });
  });

  describe("second-wind", () => {
    it("registra o HP real da ficha quando o participante recebido esta obsoleto", async () => {
      const { svc, fighter, encounter, eventService } = makeService();
      encounter.turnOrder = ["fighter"];

      const result = await svc.execute(
        "enc-1",
        "fighter",
        "second-wind",
        {},
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(fighter.currentHp).toBe(12);
      expect(fighter.bonusActionUsed).toBe(true);
      expect(eventService.emit).toHaveBeenCalledWith(
        "session-1",
        "enc-1",
        [
          expect.objectContaining({
            data: expect.objectContaining({
              hpBefore: 10,
              hpAfter: 12,
            }),
          }),
        ],
      );
    });
  });

  describe("deferred class features", () => {
    it("não sobrescreve os efeitos persistidos pelo resolver em uma free action", async () => {
      const { svc, druid, encounter, participantRepo } = makeService();
      encounter.turnOrder = ["druid"];

      const result = await svc.execute(
        "enc-1",
        "druid",
        "wild-resurgence",
        { direction: "slot-to-wild-shape", slotLevel: 1 },
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(participantRepo.save).not.toHaveBeenCalled();
      expect(druid.actionUsed).toBe(false);
      expect(druid.bonusActionUsed).toBe(false);
    });
  });

  describe("Orc species features", () => {
    it("spends bonus action and one PB use only after Adrenaline Rush resolves", async () => {
      const {
        svc,
        orc,
        encounter,
        stateService,
        classFeatureResolver,
      } = makeService();
      encounter.turnOrder = ["orc"];
      encounter.currentTurnIndex = 0;
      orc.currentHp = 10;
      orc.dyingState = "none";
      orc.effectInstances = [];

      const result = await svc.execute(
        "enc-1",
        "orc",
        "adrenaline-rush",
        {},
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(classFeatureResolver.resolveInvocation).toHaveBeenCalledWith(
        "orc",
        expect.objectContaining({ featureSlug: "adrenaline-rush" }),
      );
      expect(orc.bonusActionUsed).toBe(true);
      expect(orc.actionUsed).toBe(false);
      expect(stateService.incrementFeatureUses).toHaveBeenCalledWith(
        "char-orc",
        "adrenaline-rush",
        1,
      );
    });

    it("rejects Adrenaline Rush server-side while incapacitated", async () => {
      const {
        svc,
        orc,
        encounter,
        stateService,
        classFeatureResolver,
      } = makeService();
      encounter.turnOrder = ["orc"];
      encounter.currentTurnIndex = 0;
      orc.currentHp = 10;
      orc.dyingState = "none";
      orc.conditions = ["stunned"];
      orc.effectInstances = [];

      const result = await svc.execute(
        "enc-1",
        "orc",
        "adrenaline-rush",
        {},
        "owner-1",
      );

      expect(result).toMatchObject({
        ok: false,
        code: "CONDITION_PREVENTS_ACTION",
      });
      expect(classFeatureResolver.resolveInvocation).not.toHaveBeenCalled();
      expect(stateService.incrementFeatureUses).not.toHaveBeenCalled();
      expect(orc.bonusActionUsed).toBe(false);
    });

    it("allows declining Relentless Endurance off-turn without spending its use", async () => {
      const {
        svc,
        orc,
        stateService,
        classFeatureResolver,
        concentration,
        transactionManager,
      } = makeService();
      orc.isConcentrating = true;
      orc.concentratingOn = "bless";

      const result = await svc.execute(
        "enc-1",
        "orc",
        "relentless-endurance",
        { triggerEventId: "relentless-trigger", decline: true },
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(orc).toMatchObject({
        currentHp: 0,
        dyingState: "dying",
        isDefeated: false,
        actionUsed: false,
        bonusActionUsed: false,
        reactionsUsed: 0,
        effectInstances: [],
      });
      expect(stateService.incrementFeatureUses).not.toHaveBeenCalledWith(
        "char-orc",
        "relentless-endurance",
        expect.any(Number),
      );
      expect(classFeatureResolver.resolveInvocation).not.toHaveBeenCalled();
      expect(concentration.break).toHaveBeenCalledWith(
        orc,
        "incapacitated",
        transactionManager,
      );
    });

    it("auto-declines an expired Relentless Endurance decision", async () => {
      const { svc, orc, orcState, eventService } = makeService();
      const pending = orc.effectInstances?.[0];
      if (!pending) throw new Error("missing Relentless Endurance fixture");
      pending.appliedAt = new Date(Date.now() - 21_000).toISOString();
      pending.payload = {
        ...pending.payload,
        timeoutSeconds: 20,
      };

      const result = await svc.execute(
        "enc-1",
        "orc",
        "relentless-endurance",
        { triggerEventId: "relentless-trigger" },
        "owner-1",
      );

      expect(result).toMatchObject({
        ok: true,
        value: {
          declined: true,
          timedOut: true,
          resourceConsumed: false,
          hpAfter: 0,
        },
      });
      expect(orc.currentHp).toBe(0);
      expect(orc.effectInstances).toEqual([]);
      expect(orcState.current_hp).toBe(0);
      expect(orcState.feature_uses_used).toEqual({});
      expect(eventService.emit).toHaveBeenCalledWith(
        "session-1",
        "enc-1",
        expect.arrayContaining([
          expect.objectContaining({
            event_type: "relentless_endurance_declined",
            data: expect.objectContaining({
              reason: "decision-timeout",
            }),
          }),
        ]),
        expect.anything(),
      );
    });

    it("clears a stale decline without resurrecting a dead Orc", async () => {
      const { svc, orc, stateService, classFeatureResolver } = makeService();
      orc.currentHp = 0;
      orc.dyingState = "dead";
      orc.isDefeated = true;

      const result = await svc.execute(
        "enc-1",
        "orc",
        "relentless-endurance",
        { triggerEventId: "relentless-trigger", decline: true },
        "owner-1",
      );

      expect(result).toMatchObject({
        ok: false,
        code: "FEATURE_NOT_AVAILABLE",
      });
      expect(orc).toMatchObject({
        currentHp: 0,
        dyingState: "dead",
        isDefeated: true,
        effectInstances: [],
      });
      expect(stateService.incrementFeatureUses).not.toHaveBeenCalled();
      expect(classFeatureResolver.resolveInvocation).not.toHaveBeenCalled();
    });

    it("clears a stale decline without overwriting healing", async () => {
      const { svc, orc, orcState, stateService } = makeService();
      orc.currentHp = 7;
      orc.dyingState = "none";
      orc.isDefeated = false;
      orcState.current_hp = 7;

      const result = await svc.execute(
        "enc-1",
        "orc",
        "relentless-endurance",
        { triggerEventId: "relentless-trigger", decline: true },
        "owner-1",
      );

      expect(result).toMatchObject({
        ok: false,
        code: "FEATURE_NOT_AVAILABLE",
      });
      expect(orc).toMatchObject({
        currentHp: 7,
        dyingState: "none",
        isDefeated: false,
        effectInstances: [],
      });
      expect(stateService.incrementFeatureUses).not.toHaveBeenCalled();
    });

    it("accepts Relentless Endurance off-turn without consuming a reaction", async () => {
      const {
        svc,
        orc,
        orcState,
        stateService,
        classFeatureResolver,
        eventService,
        transactionManager,
      } = makeService();

      const result = await svc.execute(
        "enc-1",
        "orc",
        "relentless-endurance",
        { triggerEventId: "relentless-trigger" },
        "owner-1",
      );

      expect(result.ok).toBe(true);
      expect(orc.reactionsUsed).toBe(0);
      expect(orc.actionUsed).toBe(false);
      expect(orc.bonusActionUsed).toBe(false);
      expect(orc.currentHp).toBe(1);
      expect(orc.effectInstances).toEqual([]);
      expect(orcState.current_hp).toBe(1);
      expect(orcState.feature_uses_used).toEqual({
        "relentless-endurance": 1,
      });
      expect(stateService.incrementFeatureUses).not.toHaveBeenCalled();
      expect(classFeatureResolver.resolveInvocation).not.toHaveBeenCalled();
      expect(eventService.emit).toHaveBeenCalledWith(
        "session-1",
        "enc-1",
        expect.any(Array),
        transactionManager,
      );
    });

    it("rolls back Relentless Endurance when event persistence fails", async () => {
      const { svc, orc, orcState, eventService } = makeService();
      eventService.emit.mockRejectedValueOnce(
        new Error("event persistence failed"),
      );

      await expect(
        svc.execute(
          "enc-1",
          "orc",
          "relentless-endurance",
          { triggerEventId: "relentless-trigger" },
          "owner-1",
        ),
      ).rejects.toThrow("event persistence failed");

      expect(orc).toMatchObject({
        currentHp: 0,
        dyingState: "dying",
        isDefeated: false,
      });
      expect(orc.effectInstances).toHaveLength(1);
      expect(orcState.current_hp).toBe(0);
      expect(orcState.feature_uses_used).toEqual({});
    });

    it("deduplicates two identical answers to the same Relentless Endurance trigger", async () => {
      const {
        svc,
        orc,
        orcState,
        eventService,
        participantRepo,
        stateRepo,
        transaction,
      } = makeService();

      const [first, second] = await Promise.all([
        svc.execute(
          "enc-1",
          "orc",
          "relentless-endurance",
          { triggerEventId: "relentless-trigger" },
          "owner-1",
        ),
        svc.execute(
          "enc-1",
          "orc",
          "relentless-endurance",
          { triggerEventId: "relentless-trigger" },
          "owner-1",
        ),
      ]);

      expect(first.ok).toBe(true);
      expect(second).toBe(first);
      expect(orc.currentHp).toBe(1);
      expect(orc.effectInstances).toEqual([]);
      expect(orcState.feature_uses_used).toEqual({
        "relentless-endurance": 1,
      });
      expect(eventService.emit).toHaveBeenCalledTimes(1);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(participantRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "orc", encounterId: "enc-1" },
          lock: { mode: "pessimistic_write" },
        }),
      );
      expect(stateRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { character_id: "char-orc" },
          lock: { mode: "pessimistic_write" },
        }),
      );
    });
  });

  describe("guard anti duplo-submit", () => {
    function makeOrcOnTurn() {
      const ctx = makeService();
      ctx.encounter.turnOrder = ["orc"];
      ctx.encounter.currentTurnIndex = 0;
      ctx.orc.currentHp = 10;
      ctx.orc.dyingState = "none";
      ctx.orc.effectInstances = [];
      return ctx;
    }

    it("dois requests concorrentes da mesma feature compartilham uma única execução", async () => {
      const { svc, stateService, classFeatureResolver } = makeOrcOnTurn();

      const [first, second] = await Promise.all([
        svc.execute("enc-1", "orc", "adrenaline-rush", {}, "owner-1"),
        svc.execute("enc-1", "orc", "adrenaline-rush", {}, "owner-1"),
      ]);

      expect(first.ok).toBe(true);
      expect(second).toBe(first);
      expect(classFeatureResolver.resolveInvocation).toHaveBeenCalledTimes(1);
      expect(stateService.incrementFeatureUses).toHaveBeenCalledTimes(1);
    });

    it("request concorrente de outra feature falha com ACTION_IN_PROGRESS", async () => {
      const { svc } = makeOrcOnTurn();

      const first = svc.execute("enc-1", "orc", "adrenaline-rush", {}, "owner-1");
      const second = await svc.execute(
        "enc-1",
        "orc",
        "second-wind",
        {},
        "owner-1",
      );

      expect(second).toMatchObject({ ok: false, code: "ACTION_IN_PROGRESS" });
      await expect(first).resolves.toMatchObject({ ok: true });
    });

    it("libera o guard após a execução terminar", async () => {
      const { svc } = makeOrcOnTurn();

      const first = await svc.execute(
        "enc-1",
        "orc",
        "adrenaline-rush",
        {},
        "owner-1",
      );
      const second = await svc.execute(
        "enc-1",
        "orc",
        "adrenaline-rush",
        {},
        "owner-1",
      );

      expect(first.ok).toBe(true);
      expect(second).toMatchObject({
        ok: false,
        code: "BONUS_ACTION_ALREADY_USED",
      });
    });
  });
});
