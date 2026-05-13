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
  const participants: Record<string, EncounterParticipantEntity> = {
    paladin,
    target,
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
    computeSheet: jest.fn().mockResolvedValue({
      classes: [{ slug: "paladin", level: 2 }],
      abilityScores: [],
      speed: 30,
    }),
  };
  const stateService = {
    getFeatureUsesUsed: jest.fn().mockResolvedValue({ "lay-on-hands": 0 }),
    incrementFeatureUses: jest.fn().mockResolvedValue(undefined),
  };
  const genericActionsService = {
    execute: jest.fn(),
  };
  const classFeatureResolver = {};
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
  );

  return {
    svc,
    paladin,
    target,
    stateService,
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
});
