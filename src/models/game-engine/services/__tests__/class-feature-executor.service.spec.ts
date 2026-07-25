import { ClassFeatureExecutorService } from "../class-feature-executor.service";
import { DiceService } from "../dice.service";
import type { EncounterEntity } from "src/entities/encounter.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

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
  const participants: Record<string, EncounterParticipantEntity> = {
    paladin,
    target,
    rogue,
    fighter,
    druid,
  };
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
                  : "paladin",
            level:
              characterId === "char-rogue"
                ? 10
                : characterId === "char-fighter"
                  ? 1
                  : characterId === "char-druid"
                    ? 20
                  : 2,
          },
        ],
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
      characterId === "char-target" ? target.currentHp : null,
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
  );

  return {
    svc,
    paladin,
    rogue,
    fighter,
    druid,
    encounter,
    target,
    eventService,
    stateService,
    genericActionsService,
    classFeatureResolver,
    participantRepo,
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
});
