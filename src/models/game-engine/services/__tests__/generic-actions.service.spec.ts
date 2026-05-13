

import { GenericActionsService } from "../generic-actions.service";
import { ConditionEffectsService } from "../condition-effects.service";
import { DiceService } from "../dice.service";
import type { EncounterEntity } from "src/entities/encounter.entity";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

function makeEncounter(
  turnOrder: string[],
  currentTurnIndex = 0,
): Partial<EncounterEntity> {
  return {
    id: "enc-1",
    status: "active",
    turnOrder,
    currentTurnIndex,
    currentRound: 1,
    sessionId: "sess-1",
  } as Partial<EncounterEntity>;
}

function makeParticipant(
  id: string,
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id,
    displayName: id,
    type: "monster",
    faction: "enemy",
    conditions: [],
    actionUsed: false,
    bonusActionUsed: false,
    hasDashed: false,
    hasDisengaged: false,
    movementRemaining: 30,
    currentHp: 10,
    maxHp: 10,
    reactionsUsed: 0,
    dyingState: "none",
    dodgingUntilTurnOfParticipantId: null,
    helpingAllyParticipantId: null,
    helpingTargetParticipantId: null,
    helpingUntilTurnOfParticipantId: null,
    readiedAction: null,
    lastAiTurnRound: null,
    lastAiTurnResult: null,
    ...overrides,
  } as EncounterParticipantEntity;
}

function makeService(
  encounter: Partial<EncounterEntity>,
  participants: Record<string, EncounterParticipantEntity>,
) {
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
  const diceService = new DiceService();
  const conditionEffects = new ConditionEffectsService();
  const sheetService = {
    computeSheet: jest.fn().mockResolvedValue({ classes: [] }),
  };
  const svc = new GenericActionsService(
    encounterRepo as unknown as import("typeorm").Repository<EncounterEntity>,
    participantRepo as unknown as import("typeorm").Repository<EncounterParticipantEntity>,
    diceService,
    conditionEffects,
    sheetService as never,
  );
  return { svc, encounterRepo, participantRepo, sheetService };
}

describe("GenericActionsService", () => {
  describe("dodge", () => {
    it("marca actionUsed + dodgingUntilTurnOfParticipantId=self.id", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "dodge",
        participantId: "a",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.step.kind).toBe("dodge");
        expect(r.value.finalState.actionUsed).toBe(true);
      }
      expect(actor.dodgingUntilTurnOfParticipantId).toBe("a");
    });

    it("rejeita com NO_ACTION_AVAILABLE se actionUsed=true", async () => {
      const actor = makeParticipant("a", { actionUsed: true });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "dodge",
        participantId: "a",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("NO_ACTION_AVAILABLE");
    });

    it("rejeita com CONDITION_PREVENTS_ACTION se incapacitated", async () => {
      const actor = makeParticipant("a", { conditions: ["incapacitated"] });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "dodge",
        participantId: "a",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("CONDITION_PREVENTS_ACTION");
    });
  });

  describe("help", () => {
    it("setta a tríade helping* no ajudante", async () => {
      const helper = makeParticipant("helper", { faction: "ally" });
      const ally = makeParticipant("ally", { faction: "ally" });
      const enemy = makeParticipant("enemy", { faction: "enemy" });
      const { svc } = makeService(makeEncounter(["helper"]), {
        helper,
        ally,
        enemy,
      });
      const r = await svc.execute("enc-1", {
        kind: "help",
        participantId: "helper",
        allyParticipantId: "ally",
        targetParticipantId: "enemy",
      });
      expect(r.ok).toBe(true);
      expect(helper.helpingAllyParticipantId).toBe("ally");
      expect(helper.helpingTargetParticipantId).toBe("enemy");
      expect(helper.helpingUntilTurnOfParticipantId).toBe("helper");
    });

    it("rejeita se ally é faction diferente", async () => {
      const helper = makeParticipant("helper", { faction: "ally" });
      const wrongAlly = makeParticipant("wrong", { faction: "enemy" });
      const enemy = makeParticipant("enemy", { faction: "enemy" });
      const { svc } = makeService(makeEncounter(["helper"]), {
        helper,
        wrong: wrongAlly,
        enemy,
      });
      const r = await svc.execute("enc-1", {
        kind: "help",
        participantId: "helper",
        allyParticipantId: "wrong",
        targetParticipantId: "enemy",
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("hide", () => {
    it("adiciona hidden às conditions quando passa o check", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });

      const spy = jest
        .spyOn(DiceService.prototype, "rollExpression")
        .mockReturnValue({
          expression: "1d20",
          rolls: [18],
          modifier: 0,
          total: 18,
        });
      const r = await svc.execute("enc-1", {
        kind: "hide",
        participantId: "a",
      });
      expect(r.ok).toBe(true);
      expect(actor.conditions).toContain("hidden");
      spy.mockRestore();
    });

    it("NÃO adiciona hidden quando falha (mas ainda consome ação)", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const spy = jest
        .spyOn(DiceService.prototype, "rollExpression")
        .mockReturnValue({
          expression: "1d20",
          rolls: [3],
          modifier: 0,
          total: 3,
        });
      const r = await svc.execute("enc-1", {
        kind: "hide",
        participantId: "a",
      });
      expect(r.ok).toBe(true);
      expect(actor.conditions).not.toContain("hidden");
      expect(actor.actionUsed).toBe(true);
      spy.mockRestore();
    });
  });

  describe("cunning action", () => {
    it("permite Rogue L2+ usar Dash como bonus action depois da action", async () => {
      const actor = makeParticipant("a", {
        type: "pc",
        faction: "ally",
        characterId: "char-a",
        actionUsed: true,
      });
      const { svc, sheetService } = makeService(makeEncounter(["a"]), {
        a: actor,
      });
      sheetService.computeSheet.mockResolvedValue({
        classes: [{ slug: "rogue", level: 2 }],
      });

      const r = await svc.execute("enc-1", {
        kind: "dash",
        participantId: "a",
        ownerUserId: "owner-1",
      });

      expect(r.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(actor.bonusActionUsed).toBe(true);
      expect(actor.hasDashed).toBe(true);
      expect(actor.movementRemaining).toBe(60);
    });

    it("mantem NO_ACTION_AVAILABLE para nao-Rogue com action ja usada", async () => {
      const actor = makeParticipant("a", {
        type: "pc",
        faction: "ally",
        characterId: "char-a",
        actionUsed: true,
      });
      const { svc, sheetService } = makeService(makeEncounter(["a"]), {
        a: actor,
      });
      sheetService.computeSheet.mockResolvedValue({
        classes: [{ slug: "fighter", level: 2 }],
      });

      const r = await svc.execute("enc-1", {
        kind: "dash",
        participantId: "a",
        ownerUserId: "owner-1",
      });

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("NO_ACTION_AVAILABLE");
      expect(actor.bonusActionUsed).toBe(false);
      expect(actor.hasDashed).toBe(false);
    });
  });

  describe("ready", () => {
    it("persiste readiedAction com trigger enemy_enters_range", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "ready",
        participantId: "a",
        trigger: { kind: "enemy_enters_range", rangeFt: 5 },
        readiedAction: { kind: "attack", actionName: "Longsword" },
      } as Parameters<typeof svc.execute>[1]);
      expect(r.ok).toBe(true);
      expect(actor.readiedAction).toBeDefined();
      expect(actor.readiedAction?.trigger.kind).toBe("enemy_enters_range");
    });

    it("rejeita com INVALID_READY_TRIGGER se rangeFt ausente", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "ready",
        participantId: "a",
        trigger: { kind: "enemy_enters_range", rangeFt: 0 },
        readiedAction: { kind: "attack", actionName: "Longsword" },
      } as Parameters<typeof svc.execute>[1]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("INVALID_READY_TRIGGER");
    });
  });

  describe("use-object", () => {
    it("aplica poção de cura", async () => {
      const actor = makeParticipant("a", { currentHp: 5, maxHp: 20 });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "use-object",
        participantId: "a",
        objectRef: { source: "inventory", slug: "potion-of-healing" },
      });
      expect(r.ok).toBe(true);
      expect(actor.currentHp).toBeGreaterThan(5);
    });

    it("rejeita com ITEM_NOT_USABLE pra slug desconhecido", async () => {
      const actor = makeParticipant("a");
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const r = await svc.execute("enc-1", {
        kind: "use-object",
        participantId: "a",
        objectRef: { source: "inventory", slug: "banana" },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("ITEM_NOT_USABLE");
    });
  });
});
