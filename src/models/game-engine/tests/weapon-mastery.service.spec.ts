import { WeaponMasteryService } from "../services/weapon-mastery.service";
import { DiceService } from "../services/dice.service";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";




function makeParticipant(
  over: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: over.id ?? "p1",
    type: over.type ?? "pc",
    characterId: over.characterId ?? "char-1",
    displayName: over.displayName ?? "Attacker",
    positionX: over.positionX ?? 0,
    positionY: over.positionY ?? 0,
    conditions: over.conditions ?? [],
    conditionInstances: over.conditionInstances ?? [],
    effectInstances: over.effectInstances ?? [],
    isDefeated: false,
    actionUsed: false,
    bonusActionUsed: false,
    monster: over.monster,
    ...over,
  } as EncounterParticipantEntity;
}

describe("WeaponMasteryService", () => {
  let dice: DiceService;
  let service: WeaponMasteryService;
  let addedEffects: Array<{ target: EncounterParticipantEntity; input: any }>;
  let removedEffects: Array<{ target: EncounterParticipantEntity; id: string }>;
  let appliedConditions: Array<{
    target: EncounterParticipantEntity;
    input: any;
  }>;
  let savedParticipants: EncounterParticipantEntity[];

  beforeEach(() => {
    dice = new DiceService();
    dice.setSeed(42);
    addedEffects = [];
    removedEffects = [];
    appliedConditions = [];
    savedParticipants = [];

    const effectInstanceSvc: any = {
      addEffect: async (target: EncounterParticipantEntity, input: any) => {
        addedEffects.push({ target, input });
        const effect = { id: `eff-${addedEffects.length}`, ...input };
        target.effectInstances = [...(target.effectInstances ?? []), effect];
        return {
          effect,
          events: [
            { event_type: "effect_applied", data: { kind: input.kind } },
          ],
        };
      },
      removeEffect: async (target: EncounterParticipantEntity, id: string) => {
        removedEffects.push({ target, id });
        target.effectInstances = (target.effectInstances ?? []).filter(
          (e) => e.id !== id,
        );
        return { removed: true, events: [] };
      },
    };

    const conditionLifecycle: any = {
      applyCondition: async (
        target: EncounterParticipantEntity,
        input: any,
      ) => {
        appliedConditions.push({ target, input });
        target.conditions = [...(target.conditions ?? []), input.slug];
        return {
          events: [
            { event_type: "condition_applied", data: { slug: input.slug } },
          ],
          instance: {},
          concentrationBroken: false,
        };
      },
    };

    const participantRepo: any = {
      save: async (p: EncounterParticipantEntity) => {
        savedParticipants.push(p);
        return p;
      },
    };

    service = new WeaponMasteryService(
      participantRepo,
      dice,
      effectInstanceSvc,
      conditionLifecycle,
    );
  });

  describe("Graze (on miss)", () => {
    it("devolve damage = abilityMod quando mod > 0", () => {
      const ctx = {
        masterySlug: "graze",
        attacker: makeParticipant(),
        target: makeParticipant({ id: "p2" }),
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",
      };
      const res = service.resolveOnMiss(ctx);
      expect(res.grazeDamage).toEqual({ amount: 3, damageType: "slashing" });
      expect(res.events).toHaveLength(1);
      expect(res.events[0].event_type).toBe("weapon_mastery_triggered");
    });

    it("não devolve damage quando abilityMod <= 0", () => {
      const ctx = {
        masterySlug: "graze",
        attacker: makeParticipant(),
        target: makeParticipant({ id: "p2" }),
        abilityMod: 0,
        profBonus: 2,
        damageType: "slashing",
      };
      const res = service.resolveOnMiss(ctx);
      expect(res.grazeDamage).toBeUndefined();
      expect(res.events).toEqual([]);
    });

    it("ignora mastery ≠ graze em miss", () => {
      const ctx = {
        masterySlug: "sap",
        attacker: makeParticipant(),
        target: makeParticipant({ id: "p2" }),
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",
      };
      const res = service.resolveOnMiss(ctx);
      expect(res.grazeDamage).toBeUndefined();
    });
  });

  describe("Sap (on hit)", () => {
    it("aplica self_disadvantage_next_attack no target", async () => {
      const target = makeParticipant({ id: "p2" });
      const res = await service.resolveOnHit({
        masterySlug: "sap",
        attacker: makeParticipant(),
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "bludgeoning",
      });
      expect(res.applied).toEqual(["sap"]);
      expect(addedEffects).toHaveLength(1);
      expect(addedEffects[0].target).toBe(target);
      expect(addedEffects[0].input.kind).toBe("self_disadvantage_next_attack");
      expect(addedEffects[0].input.expiresAt.kind).toBe("until_consumed");
    });

    it("renova o Sap anterior sem empilhar dois efeitos visuais", async () => {
      const target = makeParticipant({
        id: "p2",
        effectInstances: [
          {
            id: "old-sap",
            kind: "self_disadvantage_next_attack",
            sourceFeatureSlug: "weapon-mastery:sap",
            payload: { masterySlug: "sap" },
            expiresAt: { kind: "until_consumed" },
          },
        ] as EncounterParticipantEntity["effectInstances"],
      });

      await service.resolveOnHit({
        masterySlug: "sap",
        attacker: makeParticipant(),
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "bludgeoning",
      });

      expect(removedEffects).toHaveLength(1);
      expect(removedEffects[0].id).toBe("old-sap");
      expect(
        target.effectInstances?.filter(
          (effect) =>
            effect.kind === "self_disadvantage_next_attack" &&
            effect.sourceFeatureSlug === "weapon-mastery:sap",
        ),
      ).toHaveLength(1);
    });
  });

  describe("Slow (on hit)", () => {
    it("aplica speed_reduction com amount=10", async () => {
      const target = makeParticipant({ id: "p2" });
      const res = await service.resolveOnHit({
        masterySlug: "slow",
        attacker: makeParticipant(),
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",
      });
      expect(res.applied).toEqual(["slow"]);
      expect(addedEffects).toHaveLength(1);
      expect(addedEffects[0].input.kind).toBe("speed_reduction");
      expect(addedEffects[0].input.payload.amount).toBe(10);
    });

    it("não empilha: remove slow anterior antes de adicionar novo", async () => {
      const target = makeParticipant({
        id: "p2",
        effectInstances: [
          {
            id: "old-slow",
            kind: "speed_reduction",
            sourceFeatureSlug: "weapon-mastery:slow",
            payload: { amount: 10 },
            expiresAt: { kind: "rounds", value: 1 },
            requiresConcentration: false,
            sourceCasterParticipantId: "p1",
            appliedAt: new Date().toISOString(),
          } as any,
        ],
      });
      await service.resolveOnHit({
        masterySlug: "slow",
        attacker: makeParticipant(),
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",
      });
      expect(removedEffects).toHaveLength(1);
      expect(removedEffects[0].id).toBe("old-slow");
    });
  });

  describe("Vex (on hit)", () => {
    it("aplica self_advantage_next_attack no attacker com requiredTargetId", async () => {
      const attacker = makeParticipant();
      const target = makeParticipant({ id: "p2" });
      const res = await service.resolveOnHit({
        masterySlug: "vex",
        attacker,
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "piercing",
      });
      expect(res.applied).toEqual(["vex"]);
      expect(addedEffects).toHaveLength(1);
      expect(addedEffects[0].target).toBe(attacker);
      expect(addedEffects[0].input.kind).toBe("self_advantage_next_attack");
      expect(addedEffects[0].input.payload.requiredTargetId).toBe("p2");
    });
  });

  describe("Topple (on hit)", () => {
    it("aplica prone quando save falha", async () => {

      dice.setSeed(1);
      const target = makeParticipant({
        id: "p2",
        type: "monster",
        monster: {
          constitution: 8,
          proficiency_bonus: 2,
          proficiencies: [],
        } as any,
      });
      const res = await service.resolveOnHit({
        masterySlug: "topple",
        attacker: makeParticipant(),
        target,
        abilityMod: 5,
        profBonus: 2,
        damageType: "bludgeoning",
      });
      expect(res.toppleSave).toBeDefined();
      expect(res.toppleSave!.dc).toBe(15);
      if (!res.toppleSave!.success) {
        expect(res.applied).toEqual(["topple"]);
        expect(appliedConditions).toHaveLength(1);
        expect(appliedConditions[0].input.slug).toBe("prone");
      }
    });

    it("DC scale com profBonus e abilityMod", async () => {
      const target = makeParticipant({
        id: "p2",
        type: "monster",
        monster: {
          constitution: 16,
          proficiency_bonus: 3,
          proficiencies: [],
        } as any,
      });
      const res = await service.resolveOnHit({
        masterySlug: "topple",
        attacker: makeParticipant(),
        target,
        abilityMod: 4,
        profBonus: 3,
        damageType: "bludgeoning",
      });
      expect(res.toppleSave!.dc).toBe(8 + 3 + 4);
    });
  });

  describe("Push (on hit)", () => {
    it("empurra alvo 10ft para longe do attacker em grid cardinal", async () => {
      const attacker = makeParticipant({ positionX: 0, positionY: 0 });
      const target = makeParticipant({ id: "p2", positionX: 2, positionY: 0 });
      const res = await service.resolveOnHit({
        masterySlug: "push",
        attacker,
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "bludgeoning",
      });
      expect(res.applied).toEqual(["push"]);
      expect(res.pushedTo).toEqual({ x: 4, y: 0 });
      expect(target.positionX).toBe(4);
      expect(savedParticipants).toContain(target);
    });

    it("não move se attacker e target na mesma célula", async () => {
      const attacker = makeParticipant({ positionX: 5, positionY: 5 });
      const target = makeParticipant({ id: "p2", positionX: 5, positionY: 5 });
      const res = await service.resolveOnHit({
        masterySlug: "push",
        attacker,
        target,
        abilityMod: 3,
        profBonus: 2,
        damageType: "bludgeoning",
      });
      expect(res.pushedTo).toBeUndefined();
      expect(target.positionX).toBe(5);
    });
  });

  describe("Cleave (RAW 2024)", () => {
    it("sem damage rolado não emite cleaveSecondTarget", async () => {
      const res = await service.resolveOnHit({
        masterySlug: "cleave",
        attacker: makeParticipant(),
        target: makeParticipant({ id: "p2" }),
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",

      });
      expect(res.cleaveSecondTarget).toBeUndefined();
    });

    it("já usou este turno: emite weapon_mastery_deferred e não aplica", async () => {
      const attacker = makeParticipant({ id: "att" });
      attacker.cleaveUsedThisTurn = true;
      const res = await service.resolveOnHit({
        masterySlug: "cleave",
        attacker,
        target: makeParticipant({ id: "p2" }),
        abilityMod: 3,
        profBonus: 2,
        damageType: "slashing",
        damageRolledAmount: 12,
      });
      expect(res.cleaveSecondTarget).toBeUndefined();
      expect(res.events[0].event_type).toBe("weapon_mastery_deferred");
      expect((res.events[0].data as { reason?: string }).reason).toBe(
        "already_used_this_turn",
      );
    });
  });

  describe("Nick (RAW 2024 — marker)", () => {
    it("emite weapon_mastery_triggered como marker pra frontend", async () => {
      const res = await service.resolveOnHit({
        masterySlug: "nick",
        attacker: makeParticipant(),
        target: makeParticipant({ id: "p2" }),
        abilityMod: 2,
        profBonus: 2,
        damageType: "piercing",
      });
      expect(res.events[0].event_type).toBe("weapon_mastery_triggered");
      expect((res.events[0].data as { masterySlug?: string }).masterySlug).toBe(
        "nick",
      );
    });
  });
});
