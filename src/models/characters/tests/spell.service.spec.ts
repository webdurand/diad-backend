import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SpellService } from "src/models/characters/services/spell.service";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterClass,
  makeCharacterAbilityScores,
  makeCharacterState,
  makeCharacterSpell,
  makeSpell,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";
import { SpellStatusEnum, SpellSourceEnum } from "src/entities/enums";
import { CASTER_CLASS_TYPE } from "src/shared/srd-constants";

describe("SpellService", () => {
  let service: SpellService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      charSpell: createMockRepository(),
      state: createMockRepository(),
      charLevelUp: createMockRepository(),
      spell: createMockRepository(),
      spellClass: createMockRepository(),
    };

    service = new SpellService(
      repos.character as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.charSpell as any,
      repos.state as any,
      repos.charLevelUp as any,
      repos.spell as any,
      repos.spellClass as any,
      // Spec 027 (M3/AC3.2) — stub do ReputationDecayService.
      { applyOnLongRest: async () => ({ campaignsAffected: 0, npcsDecayed: 0 }) } as any,
    );
  });

  const setupCaster = (
    opts: {
      classSlug?: string;
      level?: number;
      wis?: number;
      int?: number;
      cha?: number;
      existingSpells?: any[];
      xp?: number;
    } = {},
  ) => {
    const classSlug = opts.classSlug ?? "cleric";
    const level = opts.level ?? 5;
    const cc = makeCharacterClass(classSlug, level);
    const abilities = makeCharacterAbilityScores({
      wis: opts.wis ?? 16,
      int: opts.int ?? 10,
      cha: opts.cha ?? 10,
    });
    const state = makeCharacterState({ xp: opts.xp ?? 0 });
    const spells = opts.existingSpells ?? [];

    repos.character.findOne!.mockResolvedValue(makeCharacter());
    repos.charClass.find!.mockResolvedValue([cc]);
    repos.charAbility.find!.mockResolvedValue(abilities);
    repos.charSpell.find!.mockResolvedValue(spells);
    repos.state.findOne!.mockResolvedValue(state);
    repos.charLevelUp.find!.mockResolvedValue([]);

    return { cc, abilities, state, spells };
  };

  describe("updatePreparedSpells", () => {
    it("should reject known-caster classes (bard)", async () => {
      setupCaster({ classSlug: "bard", level: 5, cha: 16 });

      await expect(
        service.updatePreparedSpells("user-1", "char-1", {
          spells: ["shield"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject known-caster classes (warlock / pact)", async () => {
      setupCaster({ classSlug: "warlock", level: 5, cha: 16 });

      await expect(
        service.updatePreparedSpells("user-1", "char-1", {
          spells: ["eldritch-blast"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject cantrips in the prepared list", async () => {
      setupCaster({ classSlug: "cleric", level: 5, wis: 16 });
      const cantrip = makeSpell("sacred-flame", 0);
      repos.spell.find!.mockResolvedValue([cantrip]);

      await expect(
        service.updatePreparedSpells("user-1", "char-1", {
          spells: ["sacred-flame"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject when exceeding max prepared spells", async () => {
      // Cleric level 5, WIS 16 (+3 mod): max = 5 + 3 = 8
      setupCaster({ classSlug: "cleric", level: 5, wis: 16 });

      const tooManySpells = Array.from({ length: 9 }, (_, i) =>
        makeSpell(`spell-${i}`, 1),
      );
      repos.spell.find!.mockResolvedValue(tooManySpells);

      await expect(
        service.updatePreparedSpells("user-1", "char-1", {
          spells: tooManySpells.map((s) => s.slug),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should accept valid prepared spells for total_access caster", async () => {
      setupCaster({ classSlug: "cleric", level: 5, wis: 16 });
      const spell1 = makeSpell("cure-wounds", 1);
      const spell2 = makeSpell("bless", 1);

      repos.spell.find!.mockResolvedValue([spell1, spell2]);
      repos.spellClass.find!.mockResolvedValue([
        { spell_id: spell1.id, class_id: "class-id" },
        { spell_id: spell2.id, class_id: "class-id" },
      ]);
      repos.charSpell.remove!.mockResolvedValue([]);
      repos.charSpell.save!.mockResolvedValue({});

      const result = await service.updatePreparedSpells("user-1", "char-1", {
        spells: ["cure-wounds", "bless"],
      });

      expect(result.prepared).toHaveLength(2);
      expect(result.casterType).toBe("total_access");
      expect(result.maxPrepared).toBe(8); // 5 + 3
    });

    it("should reject spellbook spell not in wizard spellbook", async () => {
      const existingSpellbook = [
        makeCharacterSpell("magic-missile", 1, SpellStatusEnum.Spellbook),
      ];
      setupCaster({
        classSlug: "wizard",
        level: 5,
        int: 16,
        existingSpells: existingSpellbook,
      });

      // Request a spell that's not in the spellbook
      const notInBook = makeSpell("fireball", 3);
      repos.spell.find!.mockResolvedValue([notInBook]);

      await expect(
        service.updatePreparedSpells("user-1", "char-1", {
          spells: ["fireball"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException for missing character", async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(
        service.updatePreparedSpells("user-1", "no-char", { spells: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getAvailableSpells", () => {
    it('cleric/druid prepChangeMode should be "all"', async () => {
      setupCaster({ classSlug: "cleric", level: 5, wis: 16 });
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toHaveLength(1);
      expect(result[0].prepChangeMode).toBe("all");
    });

    it('paladin prepChangeMode should be "one"', async () => {
      setupCaster({ classSlug: "paladin", level: 5, cha: 16 });
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toHaveLength(1);
      expect(result[0].prepChangeMode).toBe("one");
    });

    it('ranger (known caster) prepChangeMode should be "none"', async () => {
      setupCaster({ classSlug: "ranger", level: 5, wis: 16 });

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toHaveLength(1);
      expect(result[0].prepChangeMode).toBe("none");
    });

    it('wizard prepChangeMode should be "all"', async () => {
      setupCaster({ classSlug: "wizard", level: 5, int: 16 });

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toHaveLength(1);
      expect(result[0].prepChangeMode).toBe("all");
    });

    it('bard (known caster) prepChangeMode should be "none"', async () => {
      setupCaster({ classSlug: "bard", level: 5, cha: 16 });

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toHaveLength(1);
      expect(result[0].prepChangeMode).toBe("none");
    });

    it("fighter (non-caster) should return empty results", async () => {
      setupCaster({ classSlug: "fighter", level: 5 });

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result).toEqual([]);
    });

    it("should compute maxPrepared for paladin as floor(level/2) + CHA mod (PHB 2014)", async () => {
      // Paladin level 6, CHA 16 mod +3: floor(6/2) + 3 = 6
      setupCaster({ classSlug: "paladin", level: 6, cha: 16 });
      // Source with PHB rules so paladin uses halfLevel+mod formula
      repos.character.findOne!.mockResolvedValue(
        makeCharacter({
          source: {
            code: "PHB",
            rules: {
              preparedFormulas: { paladin: "halfLevel+mod" },
            },
          },
        }),
      );
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getAvailableSpells("user-1", "char-1");
      expect(result[0].maxPrepared).toBe(6);
    });
  });

  describe("updateSpellSlots", () => {
    it("should update used spell slots", async () => {
      const cc = makeCharacterClass("wizard", 5);
      const state = makeCharacterState({ spell_slots_used: {} });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.state.findOne!.mockResolvedValue(state);
      repos.state.save!.mockResolvedValue(state);

      const result = await service.updateSpellSlots("user-1", "char-1", {
        level: 1,
        used: 2,
      });

      expect(result.level).toBe(1);
      expect(result.used).toBe(2);
      expect(result.total).toBe(4); // wizard 5: 4 first-level slots
    });

    it("should reject invalid slot level", async () => {
      const cc = makeCharacterClass("fighter", 5); // no spell slots
      const state = makeCharacterState();

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.state.findOne!.mockResolvedValue(state);

      await expect(
        service.updateSpellSlots("user-1", "char-1", { level: 1, used: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject used > total", async () => {
      const cc = makeCharacterClass("wizard", 1); // 2 first-level slots
      const state = makeCharacterState();

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.state.findOne!.mockResolvedValue(state);

      await expect(
        service.updateSpellSlots("user-1", "char-1", { level: 1, used: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("rest", () => {
    describe("short rest", () => {
      it("should recover warlock pact slots", async () => {
        const cc = makeCharacterClass("warlock", 5);
        const state = makeCharacterState({
          spell_slots_used: { pact: 2 },
          current_hp: 30,
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
        repos.state.findOne!.mockResolvedValue(state);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", {
          type: "short",
        });

        expect(result.slotsRestored).toBe(true);
        expect(result.summary).toContain("Pact Magic slots recuperados.");
      });

      it("should spend hit dice to heal on short rest", async () => {
        const cc = makeCharacterClass("fighter", 5);
        const state = makeCharacterState({
          current_hp: 20,
          hit_dice_used: {},
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(
          makeCharacterAbilityScores({ con: 14 }),
        );
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", {
          type: "short",
          hitDiceToSpend: [{ classSlug: "fighter", count: 2 }],
        });

        // Fighter d10, CON 14 mod +2: fixed heal per die = 5+1+2 = 8; 2 dice = 16
        expect(result.hpRestored).toBe(16);
      });
    });

    describe("long rest", () => {
      it("should restore HP to max", async () => {
        const cc = makeCharacterClass("fighter", 3);
        const state = makeCharacterState({
          current_hp: 10,
          spell_slots_used: {},
          hit_dice_used: {},
          death_saves_success: 0,
          death_saves_fail: 0,
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(
          makeCharacterAbilityScores({ con: 10 }),
        );
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", { type: "long" });

        expect(result.currentHp).toBe(10); // maxHp = hit_die(10) + conMod(0) = 10
        expect(result.type).toBe("long");
      });

      it("should reset all spell slots", async () => {
        const cc = makeCharacterClass("wizard", 5);
        const state = makeCharacterState({
          current_hp: 30,
          spell_slots_used: { "1": 4, "2": 2 },
          hit_dice_used: {},
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(
          makeCharacterAbilityScores({ int: 16 }),
        );
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", { type: "long" });

        expect(result.slotsRestored).toBe(true);
      });

      it("should recover half hit dice (rounded down, min 1)", async () => {
        const cc = makeCharacterClass("fighter", 5);
        const state = makeCharacterState({
          current_hp: 50,
          spell_slots_used: {},
          hit_dice_used: { fighter: 4 }, // 4 of 5 used
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(
          makeCharacterAbilityScores({ con: 10 }),
        );
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", { type: "long" });

        // floor(5/2) = 2 dice to recover, but only 4 used, so recovers min(4, 2) = 2
        expect(result.hitDiceRecovered).toBe(2);
      });

      it("should reset death saves", async () => {
        const cc = makeCharacterClass("fighter", 5);
        const state = makeCharacterState({
          current_hp: 0,
          death_saves_success: 2,
          death_saves_fail: 1,
          spell_slots_used: {},
          hit_dice_used: {},
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        const result = await service.rest("user-1", "char-1", { type: "long" });

        expect(result.deathSavesReset).toBe(true);
      });
    });

    describe("feature uses reset (Spec 011 Phase 1)", () => {
      it("short rest resets features with rechargeOn: short", async () => {
        const cc = makeCharacterClass("fighter", 5);
        const state = makeCharacterState({
          current_hp: 30,
          // All these are rechargeOn: 'short' features in the catalog.
          feature_uses_used: {
            "second-wind": 1,
            "action-surge": 1,
          },
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
        repos.state.findOne!.mockResolvedValue(state);
        repos.state.save!.mockResolvedValue(state);

        await service.rest("user-1", "char-1", { type: "short" });

        // Both short-rest features should be zeroed (or removed).
        expect(state.feature_uses_used["second-wind"] ?? 0).toBe(0);
        expect(state.feature_uses_used["action-surge"] ?? 0).toBe(0);
      });

      it("short rest does NOT reset features with rechargeOn: long", async () => {
        const cc = makeCharacterClass("paladin", 3);
        const state = makeCharacterState({
          current_hp: 30,
          // lay-on-hands has rechargeOn: 'long' — must survive short rest.
          feature_uses_used: {
            "lay-on-hands": 10,
            "divine-sense": 2,
          },
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
        repos.state.findOne!.mockResolvedValue(state);
        repos.state.save!.mockResolvedValue(state);

        await service.rest("user-1", "char-1", { type: "short" });

        expect(state.feature_uses_used["lay-on-hands"]).toBe(10);
        expect(state.feature_uses_used["divine-sense"]).toBe(2);
      });

      it("long rest resets all feature uses regardless of recharge", async () => {
        const cc = makeCharacterClass("paladin", 5);
        const state = makeCharacterState({
          current_hp: 30,
          feature_uses_used: {
            "second-wind": 1,
            "action-surge": 1,
            "lay-on-hands": 25,
            "divine-sense": 3,
          },
        });

        repos.character.findOne!.mockResolvedValue(makeCharacter());
        repos.charClass.find!.mockResolvedValue([cc]);
        repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
        repos.state.findOne!.mockResolvedValue(state);
        repos.charLevelUp.find!.mockResolvedValue([]);
        repos.state.save!.mockResolvedValue(state);

        await service.rest("user-1", "char-1", { type: "long" });

        expect(
          Object.values(state.feature_uses_used).every((v) => v === 0),
        ).toBe(true);
      });
    });
  });
});
