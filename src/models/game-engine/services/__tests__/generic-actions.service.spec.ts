

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
    encounterId: "enc-1",
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
  options?: {
    inventoryService?: {
      getInventory: jest.Mock;
      useItem: jest.Mock;
    };
    characterStateService?: {
      stabilizeAtZero: jest.Mock;
    };
  },
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
    computeSheet: jest.fn().mockResolvedValue({
      classes: [],
      abilityScores: [{ slug: "str", modifier: 2 }],
    }),
  };
  const conditionLifecycle = {
    removeConditionInstance: jest.fn(
      async (participant: EncounterParticipantEntity, instanceId: string) => {
        participant.conditionInstances = (
          participant.conditionInstances ?? []
        ).filter((instance) => instance.id !== instanceId);
        participant.conditions = Array.from(
          new Set(
            participant.conditionInstances.map((instance) => instance.slug),
          ),
        );
        return {
          removed: true,
          events: [
            {
              event_type: "condition_removed",
              target_participant_id: participant.id,
              data: { instanceId },
            },
          ],
        };
      },
    ),
  };
  const svc = new GenericActionsService(
    encounterRepo as unknown as import("typeorm").Repository<EncounterEntity>,
    participantRepo as unknown as import("typeorm").Repository<EncounterParticipantEntity>,
    diceService,
    conditionEffects,
    sheetService as never,
    conditionLifecycle as never,
    options?.inventoryService as never,
    options?.characterStateService as never,
  );
  return {
    svc,
    encounterRepo,
    participantRepo,
    sheetService,
    conditionLifecycle,
    inventoryService: options?.inventoryService,
    characterStateService: options?.characterStateService,
  };
}

describe("GenericActionsService", () => {
  describe("Haste action", () => {
    function hasteEffect() {
      return {
        id: "haste-extra",
        kind: "extra_action" as const,
        sourceSpellSlug: "haste",
        sourceCasterParticipantId: "caster",
        payload: { amount: 1, usedThisTurn: false },
        expiresAt: { kind: "concentration" as const },
        requiresConcentration: true,
        appliedAt: "2026-01-01T00:00:00.000Z",
      };
    }

    it("uses Haste for Dash without reopening the normal action", async () => {
      const actor = makeParticipant("a", {
        actionUsed: true,
        movementRemaining: 60,
        effectInstances: [
          hasteEffect(),
          {
            ...hasteEffect(),
            id: "haste-speed",
            kind: "speed_multiplier",
            payload: { amount: 2 },
          },
        ],
      });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });

      const result = await svc.execute("enc-1", {
        kind: "dash",
        participantId: "a",
        useHasteAction: true,
      });

      expect(result.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(actor.movementRemaining).toBe(120);
      expect(
        actor.effectInstances.find((effect) => effect.kind === "extra_action")
          ?.payload.usedThisTurn,
      ).toBe(true);

      const second = await svc.execute("enc-1", {
        kind: "disengage",
        participantId: "a",
        useHasteAction: true,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.code).toBe("NO_ACTION_AVAILABLE");
    });

    it("rejects Dodge because it is not a Haste option", async () => {
      const actor = makeParticipant("a", {
        actionUsed: true,
        effectInstances: [hasteEffect()],
      });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const result = await svc.execute("enc-1", {
        kind: "dodge",
        participantId: "a",
        useHasteAction: true,
      });
      expect(result.ok).toBe(false);
    });
  });

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

  describe("dash movement budget", () => {
    it("adds the creature speed instead of doubling only the remaining movement", async () => {
      const actor = makeParticipant("a", {
        monster: { speed: { walk: 40 } } as never,
        movementRemaining: 25,
      });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });

      const result = await svc.execute("enc-1", {
        kind: "dash",
        participantId: "a",
      });

      expect(result.ok).toBe(true);
      expect(actor.movementRemaining).toBe(65);
    });
  });

  describe("fear compulsion", () => {
    const fearCondition = {
      id: "fear-1",
      slug: "frightened",
      appliedBy: "caster",
      sourceSpell: "fear",
      sourceConcentration: true,
      source: "spell:fear",
      saveAbility: "wis",
      saveDc: 19,
      repeatSaveTiming: "end_of_turn",
      durationRoundsRemaining: 10,
      appliedAt: "2026-01-01T00:00:00.000Z",
    } as const;

    it("blocks other generic actions and requires the Fear flee action", async () => {
      const actor = makeParticipant("a", {
        conditions: ["frightened"],
        conditionInstances: [fearCondition as never],
        monster: { speed: { walk: 40 } } as never,
        movementRemaining: 40,
      });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });

      const blocked = await svc.execute("enc-1", {
        kind: "dodge",
        participantId: "a",
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.code).toBe("CONDITION_PREVENTS_ACTION");

      const flee = await svc.execute("enc-1", {
        kind: "flee-fear",
        participantId: "a",
      });
      expect(flee.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(actor.hasDashed).toBe(true);
      expect(actor.movementRemaining).toBe(80);
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

  describe("search", () => {
    it("falha automaticamente em busca auditiva quando Surdo", async () => {
      const actor = makeParticipant("a", { conditions: ["deafened"] });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });
      const diceSpy = jest.spyOn(DiceService.prototype, "rollExpression");

      const r = await svc.execute("enc-1", {
        kind: "search",
        participantId: "a",
        ability: "perception",
        searchSense: "hearing",
      });

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.step.result.summary).toContain("falhou automaticamente");
        expect(r.events[0].data).toMatchObject({
          searchSense: "hearing",
          total: 0,
          autoFailed: true,
          autoFailureReason: "deafened",
        });
      }
      expect(actor.actionUsed).toBe(true);
      expect(diceSpy).not.toHaveBeenCalled();
      diceSpy.mockRestore();
    });

    it("falha automaticamente em busca visual quando Cego", async () => {
      const actor = makeParticipant("a", { conditions: ["blinded"] });
      const { svc } = makeService(makeEncounter(["a"]), { a: actor });

      const r = await svc.execute("enc-1", {
        kind: "search",
        participantId: "a",
        ability: "perception",
        searchSense: "sight",
      });

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.events[0].data).toMatchObject({
          searchSense: "sight",
          total: 0,
          autoFailed: true,
          autoFailureReason: "blinded",
        });
      }
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

    it("não consome Healer's Kit sem alvo elegível", async () => {
      const actor = makeParticipant("a", {
        type: "pc",
        faction: "ally",
        characterId: "char-a",
        positionX: 1,
        positionY: 1,
      });
      const inventoryService = {
        getInventory: jest.fn().mockResolvedValue({
          items: [
            {
              id: "item-kit",
              quantity: 1,
              equipment: {
                slug: "healers-kit",
                name: "Healer's Kit",
                consumableEffect: { type: "utility", autoApply: false },
              },
            },
          ],
        }),
        useItem: jest.fn(),
      };
      const { svc } = makeService(
        makeEncounter(["a"]),
        { a: actor },
        { inventoryService },
      );

      const result = await svc.execute("enc-1", {
        kind: "use-object",
        participantId: "a",
        ownerUserId: "user-a",
        objectRef: {
          source: "inventory",
          slug: "healers-kit",
          itemId: "item-kit",
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_TARGET");
      expect(inventoryService.useItem).not.toHaveBeenCalled();
      expect(actor.actionUsed).toBe(false);
    });

    it("estabiliza alvo adjacente a 0 HP e só então consome Healer's Kit", async () => {
      const actor = makeParticipant("a", {
        type: "pc",
        faction: "ally",
        characterId: "char-a",
        positionX: 1,
        positionY: 1,
      });
      const target = makeParticipant("b", {
        type: "pc",
        faction: "ally",
        characterId: "char-b",
        displayName: "Aliado caído",
        currentHp: 0,
        maxHp: 20,
        dyingState: "dying",
        positionX: 2,
        positionY: 1,
      });
      const inventoryService = {
        getInventory: jest.fn().mockResolvedValue({
          items: [
            {
              id: "item-kit",
              quantity: 1,
              equipment: {
                slug: "healers-kit",
                name: "Healer's Kit",
                consumableEffect: { type: "utility", autoApply: false },
              },
            },
          ],
        }),
        useItem: jest.fn().mockResolvedValue({
          consumed: true,
          remainingQuantity: 0,
          effect: { type: "consumed", message: "Healer's Kit usado." },
        }),
      };
      const characterStateService = {
        stabilizeAtZero: jest.fn().mockResolvedValue(undefined),
      };
      const { svc } = makeService(
        makeEncounter(["a", "b"]),
        { a: actor, b: target },
        { inventoryService, characterStateService },
      );

      const result = await svc.execute("enc-1", {
        kind: "use-object",
        participantId: "a",
        targetParticipantId: "b",
        ownerUserId: "user-a",
        objectRef: {
          source: "inventory",
          slug: "healers-kit",
          itemId: "item-kit",
        },
      });

      expect(result.ok).toBe(true);
      expect(target.dyingState).toBe("stable");
      expect(actor.actionUsed).toBe(true);
      expect(inventoryService.useItem).toHaveBeenCalledTimes(1);
      expect(characterStateService.stabilizeAtZero).toHaveBeenCalledWith(
        "char-b",
      );
      if (result.ok) {
        expect(result.value.step.result.summary).toContain(
          "estabilizou Aliado caído",
        );
        expect(result.events[0].data).toMatchObject({
          itemName: "Healer's Kit",
          targetParticipantId: "b",
          outcome: "stabilized",
          remainingQuantity: 0,
        });
      }
    });
  });

  describe("escape-web", () => {
    const webRestraint = {
      id: "web-restraint-1",
      slug: "restrained",
      appliedBy: "caster",
      sourceSpell: "web",
      sourceConcentration: true,
      source: "spell:web",
      saveAbility: "dex",
      saveDc: 19,
      repeatSaveTiming: "never",
      durationRoundsRemaining: 600,
      appliedAt: "2026-01-01T00:00:00.000Z",
    } as const;

    it("consome a ação e mantém Restrito quando o teste de Força falha", async () => {
      const actor = makeParticipant("a", {
        conditions: ["restrained"],
        conditionInstances: [webRestraint as never],
        monster: { strength: 10, speed: { walk: 40 } } as never,
        movementRemaining: 0,
      });
      const { svc, conditionLifecycle } = makeService(makeEncounter(["a"]), {
        a: actor,
      });
      jest.spyOn(DiceService.prototype, "roll").mockReturnValueOnce(7);

      const result = await svc.execute("enc-1", {
        kind: "escape-web",
        participantId: "a",
      });

      expect(result.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(actor.conditions).toContain("restrained");
      expect(actor.movementRemaining).toBe(0);
      expect(conditionLifecycle.removeConditionInstance).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it("remove Restrito e preserva o movimento ainda disponível quando o teste de Força passa", async () => {
      const actor = makeParticipant("a", {
        conditions: ["restrained"],
        conditionInstances: [webRestraint as never],
        monster: { strength: 26, speed: { walk: 40 } } as never,
        movementRemaining: 25,
      });
      const { svc, conditionLifecycle } = makeService(makeEncounter(["a"]), {
        a: actor,
      });
      jest.spyOn(DiceService.prototype, "roll").mockReturnValueOnce(13);

      const result = await svc.execute("enc-1", {
        kind: "escape-web",
        participantId: "a",
      });

      expect(result.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(actor.conditions).not.toContain("restrained");
      expect(actor.movementRemaining).toBe(25);
      expect(conditionLifecycle.removeConditionInstance).toHaveBeenCalledWith(
        actor,
        "web-restraint-1",
        "web_escape",
      );
      jest.restoreAllMocks();
    });
  });

  describe("wake-hypnotized", () => {
    const hypnosis = {
      id: "hypnosis-1",
      slug: "hypnotized",
      appliedBy: "caster",
      sourceSpell: "hypnotic-pattern",
      sourceConcentration: true,
      source: "spell:hypnotic-pattern",
      saveAbility: "wis",
      saveDc: 19,
      repeatSaveTiming: "never",
      durationRoundsRemaining: 10,
      appliedAt: "2026-01-01T00:00:00.000Z",
    } as const;

    it("spends the action and wakes an adjacent creature", async () => {
      const actor = makeParticipant("a", {
        encounterId: "enc-1",
        positionX: 9,
        positionY: 14,
      });
      const target = makeParticipant("b", {
        encounterId: "enc-1",
        positionX: 10,
        positionY: 15,
        conditions: ["hypnotized"],
        conditionInstances: [hypnosis as never],
      });
      const { svc, conditionLifecycle } = makeService(
        makeEncounter(["a", "b"]),
        { a: actor, b: target },
      );

      const result = await svc.execute("enc-1", {
        kind: "wake-hypnotized",
        participantId: "a",
        targetParticipantId: "b",
      });

      expect(result.ok).toBe(true);
      expect(actor.actionUsed).toBe(true);
      expect(target.conditions).not.toContain("hypnotized");
      expect(conditionLifecycle.removeConditionInstance).toHaveBeenCalledWith(
        target,
        "hypnosis-1",
        "shaken_awake",
      );
    });

    it("rejects a target beyond 5 feet without spending the action", async () => {
      const actor = makeParticipant("a", {
        encounterId: "enc-1",
        positionX: 0,
        positionY: 0,
      });
      const target = makeParticipant("b", {
        encounterId: "enc-1",
        positionX: 2,
        positionY: 0,
        conditions: ["hypnotized"],
        conditionInstances: [hypnosis as never],
      });
      const { svc } = makeService(makeEncounter(["a", "b"]), {
        a: actor,
        b: target,
      });

      const result = await svc.execute("enc-1", {
        kind: "wake-hypnotized",
        participantId: "a",
        targetParticipantId: "b",
      });

      expect(result.ok).toBe(false);
      expect(actor.actionUsed).toBe(false);
    });
  });
});
