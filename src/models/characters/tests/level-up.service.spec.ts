import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { LevelUpService } from "src/models/characters/services/level-up.service";
import {
  createMockRepository,
  createMockDataSource,
} from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterClass,
  makeCharacterAbilityScores,
  makeCharacterState,
  makeCharacterSpell,
  makeClass,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";
import { XP_THRESHOLDS, CASTER_CLASS_TYPE } from "src/shared/srd-constants";
import { SpellStatusEnum } from "src/entities/enums";

interface MissingPrereqPayload {
  ability: string;
  required: number;
  current: number;
}

describe("LevelUpService", () => {
  let service: LevelUpService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let mockManager: Record<string, jest.Mock>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      partyMember: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      state: createMockRepository(),
      levelUp: createMockRepository(),
      charFeature: createMockRepository(),
      charSpell: createMockRepository(),
      charProf: createMockRepository(),
      class: createMockRepository(),
      level: createMockRepository(),
      subclass: createMockRepository(),
      spell: createMockRepository(),
      proficiency: createMockRepository(),
      spellClass: createMockRepository(),
    };

    mockManager = {
      save: jest.fn(async (_: any, data: any) => ({ id: "auto-id", ...data })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };

    dataSource = createMockDataSource();
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(mockManager),
    );

    service = new LevelUpService(
      dataSource as any,
      repos.character as any,
      repos.partyMember as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.state as any,
      repos.levelUp as any,
      repos.charFeature as any,
      repos.charSpell as any,
      repos.charProf as any,
      repos.class as any,
      repos.level as any,
      repos.subclass as any,
      repos.spell as any,
      repos.proficiency as any,
      repos.spellClass as any,
    );
  });

  const setupForExecute = (
    opts: {
      classSlug?: string;
      totalLevel?: number;
      xp?: number;
      con?: number;
    } = {},
  ) => {
    const classSlug = opts.classSlug ?? "fighter";
    const totalLevel = opts.totalLevel ?? 1;
    const xp = opts.xp ?? XP_THRESHOLDS[totalLevel];
    const con = opts.con ?? 10;

    const cc = makeCharacterClass(classSlug, totalLevel);
    const abilities = makeCharacterAbilityScores({ con });
    const state = makeCharacterState({ xp, current_hp: 10 });
    const classEntity = makeClass(classSlug);

    repos.character.findOne!.mockResolvedValue(makeCharacter());
    repos.state.findOne!.mockResolvedValue(state);
    repos.charClass.find!.mockResolvedValue([cc]);
    repos.charAbility.find!.mockResolvedValue(abilities);
    repos.class.findOneBy!.mockResolvedValue(classEntity);
    repos.level.findOne!.mockResolvedValue(null);

    return { cc, abilities, state, classEntity };
  };

  describe("getOptions", () => {
    it("should show canLevelUp=true when XP meets threshold", async () => {
      const cc = makeCharacterClass("fighter", 1);
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      expect(result.canLevelUp).toBe(true);
      expect(result.currentLevel).toBe(1);
      expect(result.newLevel).toBe(2);
    });

    it("should show canLevelUp=false when XP is below threshold", async () => {
      const cc = makeCharacterClass("fighter", 1);
      const state = makeCharacterState({ xp: 100 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      expect(result.canLevelUp).toBe(false);
    });

    it("should not allow level-up at level 20", async () => {
      const cc = makeCharacterClass("fighter", 20);
      const state = makeCharacterState({ xp: 999999 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      expect(result.canLevelUp).toBe(false);
    });

    it("should throw NotFoundException if character not found", async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(service.getOptions("user-1", "no-char")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("execute", () => {
    it("should reject if level is already 20", async () => {
      setupForExecute({ totalLevel: 20, xp: 999999 });
      repos.charClass.find!.mockResolvedValue([
        makeCharacterClass("fighter", 20),
      ]);

      await expect(
        service.execute("user-1", "char-1", {
          classSlug: "fighter",
          hpMethod: "fixed",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject if XP is insufficient", async () => {
      setupForExecute({ totalLevel: 1, xp: 100 });

      await expect(
        service.execute("user-1", "char-1", {
          classSlug: "fighter",
          hpMethod: "fixed",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should calculate fixed HP as hitDie/2 + 1 + conMod", async () => {

      setupForExecute({ totalLevel: 1, xp: 300, con: 14 });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter",
        hpMethod: "fixed",
      });

      expect(result.hpGained).toBe(8);
      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it("should calculate rolled HP correctly", async () => {
      setupForExecute({ totalLevel: 1, xp: 300, con: 10 });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter",
        hpMethod: "roll",
        hpRoll: 7,
      });

      expect(result.hpGained).toBe(7);
    });

    it("should enforce minimum 1 HP gained", async () => {


      setupForExecute({ classSlug: "wizard", totalLevel: 1, xp: 300, con: 6 });
      repos.class.findOneBy!.mockResolvedValue(makeClass("wizard"));


      const alarm = { id: "sp-al", slug: "alarm", level: 1 };
      const mm = { id: "sp-mm", slug: "magic-missile", level: 1 };
      repos.spell.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "alarm") return alarm;
          if (where.slug === "magic-missile") return mm;
          return null;
        },
      );
      repos.spellClass.find!.mockResolvedValue([
        { spell: alarm, class_id: "c-wiz", spell_id: alarm.id },
        { spell: mm, class_id: "c-wiz", spell_id: mm.id },
      ]);
      repos.charSpell.find!.mockResolvedValue([]);

      const result = await service.execute("user-1", "char-1", {
        classSlug: "wizard",
        hpMethod: "roll",
        hpRoll: 1,

        newSpells: ["alarm", "magic-missile"],
      });

      expect(result.hpGained).toBe(1);
    });

    it("should reject invalid HP roll (> hit die)", async () => {
      setupForExecute({ totalLevel: 1, xp: 300 });

      await expect(
        service.execute("user-1", "char-1", {
          classSlug: "fighter",
          hpMethod: "roll",
          hpRoll: 11,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject roll method without hpRoll", async () => {
      setupForExecute({ totalLevel: 1, xp: 300 });

      await expect(
        service.execute("user-1", "char-1", {
          classSlug: "fighter",
          hpMethod: "roll",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle CON ASI with retroactive HP adjustment", async () => {



      setupForExecute({ totalLevel: 1, xp: 300, con: 14 });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter",
        hpMethod: "fixed",
        abilityScoreIncreases: [{ abilitySlug: "con", increase: 2 }],
      });

      expect(result.hpGained).toBe(8);


      const stateSaves = mockManager.save.mock.calls.filter((call: any[]) => {
        const entity = call[0];
        return (
          typeof entity === "function" && entity.name === "CharacterStateEntity"
        );
      });
      expect(stateSaves.length).toBeGreaterThanOrEqual(1);
    });

    it("should add new spells during level-up", async () => {
      setupForExecute({ classSlug: "wizard", totalLevel: 1, xp: 300 });
      repos.class.findOneBy!.mockResolvedValue(makeClass("wizard"));

      const mm = { id: "spell-mm", slug: "magic-missile", level: 1 };
      const alarm = { id: "spell-al", slug: "alarm", level: 1 };
      repos.spell.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "magic-missile") return mm;
          if (where.slug === "alarm") return alarm;
          return null;
        },
      );
      repos.spellClass.find!.mockResolvedValue([
        { spell: mm, class_id: "c-wiz", spell_id: mm.id },
        { spell: alarm, class_id: "c-wiz", spell_id: alarm.id },
      ]);
      repos.charSpell.find!.mockResolvedValue([]);
      mockManager.findOne.mockResolvedValue(null);
      mockManager.findOneBy.mockResolvedValue(null);

      await service.execute("user-1", "char-1", {
        classSlug: "wizard",
        hpMethod: "fixed",

        newSpells: ["magic-missile", "alarm"],
      });


      const spellSaves = mockManager.save.mock.calls.filter((call: any[]) => {
        const data = call[1];
        return data?.spell_id === "spell-mm";
      });



      expect(spellSaves.length).toBeGreaterThanOrEqual(1);
      expect(spellSaves[0][1].status).toBe(SpellStatusEnum.Spellbook);
    });

    it("should use Known status for known-caster classes", async () => {
      const bardClass = makeClass("bard");
      setupForExecute({ classSlug: "bard", totalLevel: 1, xp: 300 });
      repos.class.findOneBy!.mockResolvedValue(bardClass);

      const spellEntity = { id: "spell-hf", slug: "healing-word", level: 1 };
      repos.spell.findOneBy!.mockResolvedValue(spellEntity);
      mockManager.findOne.mockResolvedValue(null);
      mockManager.findOneBy.mockResolvedValue(null);

      await service.execute("user-1", "char-1", {
        classSlug: "bard",
        hpMethod: "fixed",
        newSpells: ["healing-word"],
      });

      const spellSaves = mockManager.save.mock.calls.filter(
        (call: any[]) => call[1]?.spell_id === "spell-hf",
      );
      expect(spellSaves).toHaveLength(1);
      expect(spellSaves[0][1].status).toBe(SpellStatusEnum.Known);
    });

    it("should throw NotFoundException for missing character", async () => {
      repos.character.findOne!.mockResolvedValue(null);

      await expect(
        service.execute("user-1", "no-char", {
          classSlug: "fighter",
          hpMethod: "fixed",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });





  describe("Spec 005: PHB slug normalization", () => {
    const setupForPhbExecute = (opts: {
      classSlug: string;
      ccSlug: string;
      totalLevel?: number;
      xp?: number;
      con?: number;
    }) => {
      const totalLevel = opts.totalLevel ?? 1;
      const xp = opts.xp ?? XP_THRESHOLDS[totalLevel];
      const con = opts.con ?? 10;

      const cc = makeCharacterClass(opts.ccSlug, totalLevel);
      const abilities = makeCharacterAbilityScores({ con });
      const state = makeCharacterState({ xp, current_hp: 10 });
      const classEntity = makeClass(opts.ccSlug);

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(abilities);


      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === opts.ccSlug) return classEntity;
          if (where.slug === opts.classSlug) return classEntity;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      return { cc, classEntity };
    };

    it('PC fighter-phb + classSlug "fighter" → advances L2 (NOT multiclass)', async () => {
      setupForPhbExecute({ ccSlug: "fighter-phb", classSlug: "fighter" });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter",
        hpMethod: "fixed",
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);

    });

    it('PC fighter-phb + classSlug "fighter-phb" → advances L2 (idempotent)', async () => {
      setupForPhbExecute({ ccSlug: "fighter-phb", classSlug: "fighter-phb" });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter-phb",
        hpMethod: "fixed",
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('PC fighter-phb + classSlug "FIGHTER" (uppercase) → advances L2', async () => {
      setupForPhbExecute({ ccSlug: "fighter-phb", classSlug: "FIGHTER" });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "FIGHTER",
        hpMethod: "fixed",
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('PC fighter (XPHB) + classSlug "fighter-phb" → advances as Fighter (canonical match)', async () => {
      setupForPhbExecute({ ccSlug: "fighter", classSlug: "fighter-phb" });

      const result = await service.execute("user-1", "char-1", {
        classSlug: "fighter-phb",
        hpMethod: "fixed",
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it("GET /level-up-options: PC fighter-phb sees ONE Fighter entry with canonical slug + sourceQualifiedSlug=fighter-phb + isCurrentClass=true", async () => {
      const phbCc = makeCharacterClass("fighter-phb", 1);
      const phbFighter = phbCc.class;
      const xphbFighter = makeClass("fighter");
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([phbCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);

      repos.class.find!.mockResolvedValue([phbFighter, xphbFighter]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");

      const fighterEntries = result.availableClasses.filter(
        (c) => c.slug === "fighter" || c.slug === "fighter-phb",
      );
      expect(fighterEntries).toHaveLength(1);
      const entry = fighterEntries[0];
      expect(entry.slug).toBe("fighter");
      expect(entry.sourceQualifiedSlug).toBe("fighter-phb");
      expect(entry.isCurrentClass).toBe(true);
      expect(entry.isMulticlass).toBe(false);
      expect(entry.nextLevel).toBe(2);
    });

    it("GET /level-up-options: PC fighter (XPHB) sees Fighter entry with sourceQualifiedSlug=fighter + isCurrentClass=true", async () => {
      const xphbCc = makeCharacterClass("fighter", 1);
      const phbFighter = makeClass("fighter-phb");
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([xphbCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([xphbCc.class, phbFighter]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      const entry = result.availableClasses.find((c) => c.slug === "fighter");
      expect(entry).toBeDefined();
      expect(entry!.sourceQualifiedSlug).toBe("fighter");
      expect(entry!.isCurrentClass).toBe(true);
    });

    it("GET /level-up-options: Fighter PHB + Wizard in DB → Wizard entry is isCurrentClass=false, isMulticlass=true, nextLevel=1", async () => {
      const fighterPhbCc = makeCharacterClass("fighter-phb", 1);
      const wizardEntity = makeClass("wizard");
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterPhbCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, int: 13 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([fighterPhbCc.class, wizardEntity]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      const wiz = result.availableClasses.find((c) => c.slug === "wizard");
      expect(wiz).toBeDefined();
      expect(wiz!.isCurrentClass).toBe(false);
      expect(wiz!.isMulticlass).toBe(true);
      expect(wiz!.nextLevel).toBe(1);
    });

    it("GET /level-up-options: PC PHB with missing LevelEntity → fallback to XPHB + featureSourceFallback exposed", async () => {
      const phbCc = makeCharacterClass("fighter-phb", 1);
      const phbFighter = phbCc.class;
      const xphbFighter = makeClass("fighter");

      const character = makeCharacter({
        source: {
          code: "PHB",
          rules: { featureFallbackSource: "XPHB" },
        },
      });
      const state = makeCharacterState({ xp: 300 });

      const xphbLevel2Data = {
        id: "level-xphb-fighter-2",
        class_id: xphbFighter.id,
        level: 2,
        subclass_id: null,
        spellcasting: null,
        ability_score_bonuses: 0,
        level_features: [
          {
            feature: {
              id: "f1",
              slug: "action-surge",
              name: "Action Surge",
              description: {},
            },
          },
        ],
      };

      repos.character.findOne!.mockResolvedValue(character);
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([phbCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([phbFighter, xphbFighter]);

      repos.class.findOne!.mockImplementation(
        async ({ where }: { where: { slug: string } }) => {
          if (where.slug === "fighter") {
            return { ...xphbFighter, source: { code: "XPHB" } };
          }
          return null;
        },
      );
      repos.level.findOne!.mockImplementation(
        async ({ where }: { where: { class_id: string } }) => {
          if (where.class_id === xphbFighter.id) return xphbLevel2Data;
          return null;
        },
      );
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      const fighter = result.availableClasses.find((c) => c.slug === "fighter");
      expect(fighter).toBeDefined();
      expect(fighter!.sourceQualifiedSlug).toBe("fighter-phb");
      expect(fighter!.featureSourceFallback).toBe("XPHB");
      expect(fighter!.features.map((f) => f.slug)).toContain("action-surge");
    });

    it("GET /level-up-options: missingPrerequisites populated when ability insufficient", async () => {
      const fighterCc = makeCharacterClass("fighter", 1);
      const bardEntity = makeClass("bard", {
        multi_classing: {
          prerequisites: [
            { ability_score: { index: "cha" }, minimum_score: 13 },
          ],
        },
      });
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);

      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, cha: 8 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([fighterCc.class, bardEntity]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions("user-1", "char-1");
      const bard = result.availableClasses.find((c) => c.slug === "bard");
      expect(bard).toBeDefined();
      expect(bard!.meetsPrerequisites).toBe(false);
      expect(bard!.missingPrerequisites).toEqual([
        { ability: "cha", required: 13, current: 8 },
      ]);
    });

    it("POST /level-up: Fighter CHA 8 attempting Bard → 403 MULTICLASS_PREREQ_NOT_MET with missingPrerequisites", async () => {
      const fighterCc = makeCharacterClass("fighter", 1);
      const bardEntity = makeClass("bard", {
        multi_classing: {
          prerequisites: [
            { ability_score: { index: "cha" }, minimum_score: 13 },
          ],
        },
      });
      const state = makeCharacterState({ xp: 300, current_hp: 10 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);

      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, cha: 8 }),
      );
      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "bard") return bardEntity;
          if (where.slug === "fighter") return fighterCc.class;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      let caught: ForbiddenException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "bard",
          hpMethod: "fixed",
        });
      } catch (e) {
        caught = e as ForbiddenException;
      }
      expect(caught).toBeInstanceOf(ForbiddenException);
      const body = caught!.getResponse() as {
        code: string;
        missingPrerequisites: MissingPrereqPayload[];
      };
      expect(body.code).toBe("MULTICLASS_PREREQ_NOT_MET");
      expect(body.missingPrerequisites).toEqual([
        { ability: "cha", required: 13, current: 8 },
      ]);
    });

    it("POST /level-up: Fighter CHA 13 → Bard multiclass allowed", async () => {
      const fighterCc = makeCharacterClass("fighter", 1);
      const bardEntity = makeClass("bard", {
        multi_classing: {
          prerequisites: [
            { ability_score: { index: "cha" }, minimum_score: 13 },
          ],
        },
      });
      const state = makeCharacterState({ xp: 300, current_hp: 10 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, cha: 13 }),
      );
      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "bard") return bardEntity;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      const result = await service.execute("user-1", "char-1", {
        classSlug: "bard",
        hpMethod: "fixed",
      });
      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(1);
    });

    it("Wizard L1 → L2 without newSpells → 400 WIZARD_SPELLS_REQUIRED", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as {
        code: string;
        requiredCount: number;
      };
      expect(body.code).toBe("WIZARD_SPELLS_REQUIRED");
      expect(body.requiredCount).toBe(2);
    });

    it("Wizard L1 → L2 with 3 spells → 400 WIZARD_SPELLS_LIMIT_EXCEEDED", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
          newSpells: ["alarm", "magic-missile", "fireball"],
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as {
        code: string;
        allowed: number;
        received: number;
      };
      expect(body.code).toBe("WIZARD_SPELLS_LIMIT_EXCEEDED");
      expect(body.allowed).toBe(2);
      expect(body.received).toBe(3);
    });

    it("Wizard L1 → L2 with duplicate spell in selection → 400 WIZARD_SPELL_INVALID duplicate_in_selection", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
          newSpells: ["alarm", "alarm"],
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as {
        code: string;
        reason: string;
        slug: string;
      };
      expect(body.code).toBe("WIZARD_SPELL_INVALID");
      expect(body.reason).toBe("duplicate_in_selection");
      expect(body.slug).toBe("alarm");
    });

    it("Wizard L1 → L2 with Fireball (L3) → 400 WIZARD_SPELL_INVALID above_max_spell_level", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });
      const fireball = { id: "spell-fb", slug: "fireball", level: 3 };
      const alarm = { id: "spell-alarm", slug: "alarm", level: 1 };

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);
      repos.spell.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "fireball") return fireball;
          if (where.slug === "alarm") return alarm;
          return null;
        },
      );

      repos.spellClass.find!.mockResolvedValue([
        { class_id: wizCc.class.id, spell_id: alarm.id, spell: alarm },
        { class_id: wizCc.class.id, spell_id: fireball.id, spell: fireball },
      ]);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
          newSpells: ["alarm", "fireball"],
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as {
        code: string;
        reason: string;
        slug: string;
      };
      expect(body.code).toBe("WIZARD_SPELL_INVALID");
      expect(body.reason).toBe("above_max_spell_level");
      expect(body.slug).toBe("fireball");
    });

    it("Wizard L1 → L2 with spell not in class list → 400 WIZARD_SPELL_INVALID not_in_class_list", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });
      const cureWounds = { id: "spell-cw", slug: "cure-wounds", level: 1 };
      const alarm = { id: "spell-alarm", slug: "alarm", level: 1 };

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);
      repos.spell.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "cure-wounds") return cureWounds;
          if (where.slug === "alarm") return alarm;
          return null;
        },
      );

      repos.spellClass.find!.mockResolvedValue([
        { class_id: wizCc.class.id, spell_id: alarm.id, spell: alarm },
      ]);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
          newSpells: ["alarm", "cure-wounds"],
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as {
        code: string;
        reason: string;
        slug: string;
      };
      expect(body.code).toBe("WIZARD_SPELL_INVALID");
      expect(body.reason).toBe("not_in_class_list");
      expect(body.slug).toBe("cure-wounds");
    });

    it("Wizard L1 → L2 with a spell already in spellbook → 400 WIZARD_SPELL_ALREADY_KNOWN", async () => {
      const wizCc = makeCharacterClass("wizard", 1);
      const state = makeCharacterState({ xp: 300, current_hp: 8 });
      const alarm = { id: "spell-alarm", slug: "alarm", level: 1 };
      const magicMissile = { id: "spell-mm", slug: "magic-missile", level: 1 };

      const existingAlarm = {
        id: "cs-1",
        character_id: "char-1",
        spell_id: alarm.id,
        spell: alarm,
        source: "class",
        status: "spellbook",
      };

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([wizCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([existingAlarm]);
      repos.class.findOneBy!.mockResolvedValue(wizCc.class);
      repos.level.findOne!.mockResolvedValue(null);
      repos.spell.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "alarm") return alarm;
          if (where.slug === "magic-missile") return magicMissile;
          return null;
        },
      );
      repos.spellClass.find!.mockResolvedValue([
        { class_id: wizCc.class.id, spell_id: alarm.id, spell: alarm },
        {
          class_id: wizCc.class.id,
          spell_id: magicMissile.id,
          spell: magicMissile,
        },
      ]);

      let caught: BadRequestException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "wizard",
          hpMethod: "fixed",
          newSpells: ["alarm", "magic-missile"],
        });
      } catch (e) {
        caught = e as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const body = caught!.getResponse() as { code: string; slug: string };
      expect(body.code).toBe("WIZARD_SPELL_ALREADY_KNOWN");
      expect(body.slug).toBe("alarm");
    });

    it("GET /level-up-options: Paladin PHB formula = halfLevel+mod; XPHB = level+mod", async () => {



      const paladinCc = makeCharacterClass("paladin", 5, {
        class: {
          ...makeClass("paladin"),
          spellcasting: { level: 5, spellcasting_ability: { slug: "cha" } },
        },
      });
      const phbCharacter = makeCharacter({
        source: {
          code: "PHB",
          rules: { preparedFormulas: { paladin: "halfLevel+mod" } },
        },
      });
      const state = makeCharacterState({ xp: 6500 });

      repos.character.findOne!.mockResolvedValue(phbCharacter);
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([paladinCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ cha: 14 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([paladinCc.class]);
      repos.level.findOne!.mockResolvedValue({
        spellcasting: { spell_slots_level_1: 4, spell_slots_level_2: 2 },
        ability_score_bonuses: 0,
        level_features: [],
      });
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const resultPhb = await service.getOptions("user-1", "char-1");
      const paladinPhb = resultPhb.availableClasses.find(
        (c) => c.slug === "paladin",
      );
      expect(paladinPhb?.spellSelection?.maxPrepared).toBe(5);


      const xphbCharacter = makeCharacter({
        source: {
          code: "XPHB",
          rules: { preparedFormulas: { paladin: "level+mod" } },
        },
      });
      repos.character.findOne!.mockResolvedValue(xphbCharacter);

      const resultXphb = await service.getOptions("user-1", "char-1");
      const paladinXphb = resultXphb.availableClasses.find(
        (c) => c.slug === "paladin",
      );
      expect(paladinXphb?.spellSelection?.maxPrepared).toBe(8);
    });

    it("POST /level-up: Fighter STR 12 CHA 8 attempting Paladin → 403 with BOTH missing prereqs", async () => {

      const fighterCc = makeCharacterClass("fighter", 1);
      const paladinEntity = makeClass("paladin", {
        multi_classing: {
          prerequisites: [
            { ability_score: { index: "str" }, minimum_score: 13 },
            { ability_score: { index: "cha" }, minimum_score: 13 },
          ],
        },
      });
      const state = makeCharacterState({ xp: 300, current_hp: 10 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 12, cha: 8 }),
      );
      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "paladin") return paladinEntity;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      let caught: ForbiddenException | null = null;
      try {
        await service.execute("user-1", "char-1", {
          classSlug: "paladin",
          hpMethod: "fixed",
        });
      } catch (e) {
        caught = e as ForbiddenException;
      }
      expect(caught).toBeInstanceOf(ForbiddenException);
      const body = caught!.getResponse() as {
        code: string;
        missingPrerequisites: MissingPrereqPayload[];
      };
      expect(body.code).toBe("MULTICLASS_PREREQ_NOT_MET");

      expect(body.missingPrerequisites).toEqual(
        expect.arrayContaining([
          { ability: "str", required: 13, current: 12 },
          { ability: "cha", required: 13, current: 8 },
        ]),
      );
      expect(body.missingPrerequisites).toHaveLength(2);
    });

    it("Non-Wizard classes are not gated by the 2-spells rule", async () => {

      setupForExecute({ classSlug: "bard", totalLevel: 1, xp: 300 });
      repos.class.findOneBy!.mockResolvedValue(makeClass("bard"));

      const result = await service.execute("user-1", "char-1", {
        classSlug: "bard",
        hpMethod: "fixed",
      });
      expect(result.totalLevel).toBe(2);
    });

    it("Wizard first level (multiclass entry at L1) does NOT require 2 spells", async () => {

      const fighterCc = makeCharacterClass("fighter", 1);
      const wizardEntity = makeClass("wizard");
      const state = makeCharacterState({ xp: 300, current_hp: 10 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, int: 13 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "wizard") return wizardEntity;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      const result = await service.execute("user-1", "char-1", {
        classSlug: "wizard",
        hpMethod: "fixed",
      });
      expect(result.classLevel).toBe(1);
    });

    it('PC fighter-phb + classSlug "wizard" → multiclass (different canonical root)', async () => {
      const fighterPhbCc = makeCharacterClass("fighter-phb", 1);
      const wizardEntity = makeClass("wizard");
      const abilities = makeCharacterAbilityScores({ int: 13 });
      const state = makeCharacterState({
        xp: XP_THRESHOLDS[1],
        current_hp: 10,
      });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterPhbCc]);
      repos.charAbility.find!.mockResolvedValue(abilities);
      repos.class.findOneBy!.mockImplementation(
        async (where: { slug: string }) => {
          if (where.slug === "fighter-phb") return fighterPhbCc.class;
          if (where.slug === "wizard") return wizardEntity;
          return null;
        },
      );
      repos.level.findOne!.mockResolvedValue(null);

      const result = await service.execute("user-1", "char-1", {
        classSlug: "wizard",
        hpMethod: "fixed",
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(1);
      expect(result.className).toBe("Wizard");
    });
  });
});
