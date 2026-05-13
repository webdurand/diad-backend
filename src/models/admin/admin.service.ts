import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as path from "path";
import * as fs from "fs";

import {
  AbilityScoreEntity,
  AlignmentEntity,
  BackgroundEntity,
  BackgroundProficiencyEntity,
  ClassEntity,
  ClassProficiencyEntity,
  ClassSavingThrowEntity,
  ClassStartingEquipmentEntity,
  CompSourceEntity,
  ConditionEntity,
  DamageTypeEntity,
  EquipmentCategoryEntity,
  EquipmentCategoryItemEntity,
  EquipmentEntity,
  OptionalFeatureEntity,
  FeatEntity,
  FeatureEntity,
  LanguageEntity,
  LevelEntity,
  LevelFeatureEntity,
  MagicItemEntity,
  MagicItemVariantEntity,
  MagicSchoolEntity,
  MonsterEntity,
  ProficiencyEntity,
  RaceEntity,
  RaceLanguageEntity,
  RaceTraitEntity,
  RuleEntity,
  RuleSectionEntity,
  RuleSectionLinkEntity,
  SkillEntity,
  SpellEntity,
  SpellClassEntity,
  SpellSubclassEntity,
  SubclassEntity,
  SubraceEntity,
  SubraceTraitEntity,
  TraitEntity,
  TraitProficiencyEntity,
  WeaponMasteryPropertyEntity,
  WeaponPropertyEntity,
  FeatTypeEnum,
  ProficiencyTypeEnum,
  AttackTypeEnum,
} from "../../entities";
import { ALL_SOURCES } from "../../data/sources";
import {
  transformConditions,
  transformLanguages,
  transformSkills,
  transformEquipmentCategories,
  transformWeaponProperties,
  transformWeaponMasteryProperties,
  transformRaces,
  transformSubraces,
  extractTraitsFromRace,
  extractTraitsFromSubrace,
  transformClasses,
  transformSubclasses5e,
  transformFeatures,
  transformLevels,
  transformSpells,
  loadSpellClassMappings,
  transformFeats,
  transformBackgrounds,
  transformEquipment,
  transformMagicItems,
  transformOptionalFeatures,
  transformMonstersByFile,
} from "../../data/transformers";




export interface SeedResult {
  entity: string;
  total: number;
  success: number;
  errors: { slug: string; message: string }[];
}

type JsonRef = { index: string; name?: string; url?: string };




@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly jsonDir = path.resolve(process.cwd(), "src/data/json");

  constructor(@InjectDataSource() private readonly ds: DataSource) {}



  private loadJson<T = any>(filename: string): T {
    const filePath = path.join(this.jsonDir, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  }

  private async getOrCreateSource(): Promise<string> {
    const repo = this.ds.getRepository(CompSourceEntity);
    let source = await repo.findOne({ where: { code: "SRD" } });
    if (!source) {
      source = repo.create({
        code: "SRD",
        name: "System Reference Document 5e",
        abbreviation: "SRD",
        edition: "classic",
        year: 2014,
        group: "core",
      });
      source = await repo.save(source);
    }
    return source.id;
  }

  private async sourceCodeToId(code: string): Promise<string | null> {
    const repo = this.ds.getRepository(CompSourceEntity);
    const source = await repo.findOne({ where: { code } });
    return source ? source.id : null;
  }

  private async sourceCodeToIdMap(): Promise<Map<string, string>> {
    const rows = await this.ds.getRepository(CompSourceEntity).find();
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.code, r.id);
    return map;
  }

  private async slugToId(
    entity: new () => any,
    slug: string,
  ): Promise<string | null> {
    const row = await this.ds
      .getRepository(entity)
      .findOne({ where: { slug } as any });
    return row ? row.id : null;
  }

  private async slugToIdMap(
    entity: new () => any,
  ): Promise<Map<string, string>> {
    const rows: any[] = await this.ds.getRepository(entity).find();
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.slug ?? r.index, r.id);
    return map;
  }

  private result(
    entity: string,
    total: number,
    success: number,
    errors: { slug: string; message: string }[],
  ): SeedResult {
    if (errors.length) {
      this.logger.warn(
        `[${entity}] ${success}/${total} OK — ${errors.length} erros`,
      );
      errors.forEach((e) => this.logger.error(`  ↳ ${e.slug}: ${e.message}`));
    } else {
      this.logger.log(`[${entity}] ${success}/${total} OK`);
    }
    return { entity, total, success, errors };
  }



  async seedCompSources(): Promise<SeedResult> {
    const repo = this.ds.getRepository(CompSourceEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const src of ALL_SOURCES) {
      try {
        await repo.upsert(
          {
            code: src.code,
            name: src.name,
            abbreviation: src.abbreviation,
            edition: src.edition,
            year: src.year,
            group: src.group,
          },
          { conflictPaths: ["code"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: src.code, message: err.message });
      }
    }
    return this.result("comp_sources", ALL_SOURCES.length, success, errors);
  }



  async seedAbilityScores(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Ability-Scores.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(AbilityScoreEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            full_name: item.full_name,
            description: item.description,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("ability_scores", data.length, success, errors);
  }

  async seedAlignments(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Alignments.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(AlignmentEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            abbreviation: item.abbreviation,
            description: item.description,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("alignments", data.length, success, errors);
  }

  async seedConditions(): Promise<SeedResult> {
    const items = transformConditions();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(ConditionEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("conditions", items.length, success, errors);
  }

  async seedDamageTypes(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Damage-Types.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(DamageTypeEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("damage_types", data.length, success, errors);
  }

  async seedLanguages(): Promise<SeedResult> {
    const items = transformLanguages();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(LanguageEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            is_rare: item.is_rare,
            note: item.note ?? undefined,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("languages", items.length, success, errors);
  }

  async seedMagicSchools(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Magic-Schools.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(MagicSchoolEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("magic_schools", data.length, success, errors);
  }

  async seedWeaponProperties(): Promise<SeedResult> {
    const items = transformWeaponProperties();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(WeaponPropertyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("weapon_properties", items.length, success, errors);
  }

  async seedWeaponMasteryProperties(): Promise<SeedResult> {
    const items = transformWeaponMasteryProperties();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(WeaponMasteryPropertyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result(
      "weapon_mastery_properties",
      items.length,
      success,
      errors,
    );
  }

  async seedRuleSections(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Rule-Sections.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(RuleSectionEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.desc,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("rule_sections", data.length, success, errors);
  }

  async seedEquipmentCategories(): Promise<SeedResult> {

    const srdData = this.loadJson<any[]>("5e-SRD-Equipment-Categories.json");
    const sourceId = await this.getOrCreateSource();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(EquipmentCategoryEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of srdData) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }


    const fiveToolsCategories = transformEquipmentCategories();
    for (const item of fiveToolsCategories) {
      try {
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            source_id: sourceMap.get(item.source_code) ?? sourceId,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }

    const total = srdData.length + fiveToolsCategories.length;
    return this.result("equipment_categories", total, success, errors);
  }

  async seedProficiencies(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Proficiencies.json");
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(ProficiencyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const typeMap: Record<string, ProficiencyTypeEnum> = {
      Armor: ProficiencyTypeEnum.Armor,
      Weapon: ProficiencyTypeEnum.Weapon,
      Skill: ProficiencyTypeEnum.Skill,
      Tool: ProficiencyTypeEnum.Tool,
      "Saving Throws": ProficiencyTypeEnum.SavingThrow,
      Other: ProficiencyTypeEnum.Other,
    };

    for (const item of data) {
      try {
        const profType = typeMap[item.type] ?? ProficiencyTypeEnum.Other;
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            proficiency_type: profType,
            reference: item.reference ?? {},
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("proficiencies", data.length, success, errors);
  }



  async seedSkills(): Promise<SeedResult> {
    const items = transformSkills();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(SkillEntity);
    const abilityMap = await this.slugToIdMap(AbilityScoreEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const abilityId = item.ability_score_slug
          ? abilityMap.get(item.ability_score_slug)
          : undefined;
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            ability_score_id: abilityId,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("skills", items.length, success, errors);
  }

  async seedEquipment(): Promise<SeedResult> {
    const items = transformEquipment();
    const sourceMap = await this.sourceCodeToIdMap();
    const eqRepo = this.ds.getRepository(EquipmentEntity);
    const catMap = await this.slugToIdMap(EquipmentCategoryEntity);
    const wpMap = await this.slugToIdMap(WeaponPropertyEntity);
    const eciRepo = this.ds.getRepository(EquipmentCategoryItemEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const sourceId = sourceMap.get(item.source_code) ?? undefined;


        const propsJsonb =
          item.properties.length > 0
            ? item.properties.map((slug) => ({ slug, name: slug }))
            : null;


        const masteryJsonb =
          item.mastery_slugs.length > 0
            ? { slug: item.mastery_slugs[0], name: item.mastery_slugs[0] }
            : null;

        await eqRepo.upsert(
          {
            slug: item.slug,
            name: item.name,
            weight: String(item.weight),
            description: item.description || undefined,
            cost: item.cost,
            damage: (item.damage ?? undefined) as any,
            armor_class: (item.armor_class ?? undefined) as any,
            properties: (propsJsonb ?? undefined) as any,
            range: (item.range ?? undefined) as any,
            mastery: (masteryJsonb ?? undefined) as any,
            utilize: (item.utilize ?? undefined) as any,
            contents: (item.contents ?? undefined) as any,
            craft: (item.craft ?? undefined) as any,
            consumable_effect: (item.consumable_effect ?? undefined) as any,
            stealth_disadvantage: item.stealth_disadvantage,
            str_minimum: item.str_minimum ?? undefined,
            weapon_category: item.weapon_category ?? undefined,
            don_time: item.don_time ?? undefined,
            doff_time: item.doff_time ?? undefined,
            source_id: sourceId,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );


        const eqId = (await this.slugToId(EquipmentEntity, item.slug))!;
        for (const catSlug of item.category_slugs) {
          const catId = catMap.get(catSlug);
          if (!catId) continue;
          await eciRepo.upsert(
            { equipment_id: eqId, category_id: catId },
            { conflictPaths: ["equipment_id", "category_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("equipments", items.length, success, errors);
  }

  async seedFeats(): Promise<SeedResult> {
    const items = transformFeats();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(FeatEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const typeMap: Record<string, FeatTypeEnum> = {
      origin: FeatTypeEnum.Origin,
      general: FeatTypeEnum.General,
      epic_boon: FeatTypeEnum.EpicBoon,
      fighting_style: FeatTypeEnum.FightingStyle,
      dragonmark: FeatTypeEnum.Other,
      other: FeatTypeEnum.Other,
    };

    for (const item of items) {
      try {
        const sourceId = sourceMap.get(item.source_code) ?? null;

        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            feat_type: typeMap[item.feat_type] ?? FeatTypeEnum.Other,
            repeatable: item.repeatable ?? undefined,
            prerequisites: (item.prerequisites ?? undefined) as any,
            prerequisite_options: (item.ability_options ?? undefined) as any,
            source_id: sourceId ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("feats", items.length, success, errors);
  }

  async seedRules(): Promise<SeedResult> {
    const data = this.loadJson<any[]>("5e-SRD-Rules.json");
    const sourceId = await this.getOrCreateSource();
    const ruleRepo = this.ds.getRepository(RuleEntity);
    const linkRepo = this.ds.getRepository(RuleSectionLinkEntity);
    const sectionMap = await this.slugToIdMap(RuleSectionEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await ruleRepo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.desc,
            url: item.url ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ["slug"] },
        );

        const ruleId = (await this.slugToId(RuleEntity, item.index))!;
        const subs: JsonRef[] = item.subsections ?? [];
        for (const sub of subs) {
          const sectionId = sectionMap.get(sub.index);
          if (!sectionId) continue;
          await linkRepo.upsert(
            { rule_id: ruleId, section_id: sectionId },
            { conflictPaths: ["rule_id", "section_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result("rules", data.length, success, errors);
  }



  async seedClasses(): Promise<SeedResult> {
    const items = transformClasses();
    const sourceMap = await this.sourceCodeToIdMap();
    const classRepo = this.ds.getRepository(ClassEntity);
    const cpRepo = this.ds.getRepository(ClassProficiencyEntity);
    const csRepo = this.ds.getRepository(ClassSavingThrowEntity);
    const profMap = await this.slugToIdMap(ProficiencyEntity);
    const abilityMap = await this.slugToIdMap(AbilityScoreEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await classRepo.upsert(
          {
            slug: item.slug,
            name: item.name,
            hit_die: item.hit_die,
            proficiency_choices: item.proficiency_choices as any,
            starting_equipment_options: (item.starting_equipment_options ??
              undefined) as any,
            multi_classing: item.multi_classing as any,
            spellcasting: (item.spellcasting ?? undefined) as any,
            weapon_mastery_count: item.weapon_mastery_count,
            weapon_mastery_restriction:
              item.weapon_mastery_restriction ?? undefined,
            cantrips_known: item.cantrips_known,
            spells_prepared_count: item.spells_prepared_count,
            spellbook_count: item.spellbook_count,
            class_features_level_1: (item.class_features_level_1 ??
              undefined) as any,
            tool_choice: (item.tool_choice ?? undefined) as any,
            always_prepared_spells: (item.always_prepared_spells ??
              undefined) as any,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );

        const classId = (await this.slugToId(ClassEntity, item.slug))!;


        for (const abilitySlug of item.saving_throw_slugs) {
          const abilityId = abilityMap.get(abilitySlug);
          if (!abilityId) continue;
          await csRepo.upsert(
            { class_id: classId, ability_score_id: abilityId },
            { conflictPaths: ["class_id", "ability_score_id"] },
          );
        }


        for (const profSlug of item.proficiency_slugs) {
          const profId = profMap.get(profSlug);
          if (!profId) continue;
          await cpRepo.upsert(
            { class_id: classId, proficiency_id: profId },
            { conflictPaths: ["class_id", "proficiency_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("classes", items.length, success, errors);
  }

  async seedRaces(): Promise<SeedResult> {
    const items = transformRaces();
    const sourceMap = await this.sourceCodeToIdMap();
    const raceRepo = this.ds.getRepository(RaceEntity);
    const rlRepo = this.ds.getRepository(RaceLanguageEntity);
    const langMap = await this.slugToIdMap(LanguageEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        await raceRepo.upsert(
          {
            slug: item.slug,
            name: item.name,
            speed: item.speed,
            ability_bonuses: item.ability_bonuses as any,
            age: item.age,
            size: item.size,
            size_description: item.size_description,
            language_options: (item.language_options ?? undefined) as any,
            language_desc: item.language_desc,
            ability_bonus_options: (item.ability_bonus_options ??
              undefined) as any,
            alignment: item.alignment,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );

        const raceId = (await this.slugToId(RaceEntity, item.slug))!;


        for (const langSlug of item.language_slugs) {
          const langId = langMap.get(langSlug);
          if (!langId) continue;
          await rlRepo.upsert(
            { race_id: raceId, language_id: langId },
            { conflictPaths: ["race_id", "language_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("races", items.length, success, errors);
  }



  async seedSubclasses(): Promise<SeedResult> {
    const items = transformSubclasses5e();
    const sourceMap = await this.sourceCodeToIdMap();
    const classMap = await this.slugToIdMap(ClassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const classId = classMap.get(item.class_slug) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(SubclassEntity)
          .values({
            slug: item.slug,
            name: item.name,
            subclass_flavor: item.subclass_flavor,
            description: item.description,
            spells: (item.spells ?? undefined) as any,
            class_id: classId,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          })
          .orUpdate(
            [
              "name",
              "subclass_flavor",
              "description",
              "spells",
              "class_id",
              "source_id",
              "raw",
            ],
            ["slug"],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("subclasses", items.length, success, errors);
  }

  async seedSubraces(): Promise<SeedResult> {
    const items = transformSubraces();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(SubraceEntity);
    const raceMap = await this.slugToIdMap(RaceEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const raceId = raceMap.get(item.race_slug) ?? undefined;
        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            ability_bonuses: item.ability_bonuses as any,
            race_id: raceId,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("subraces", items.length, success, errors);
  }

  async seedTraits(): Promise<SeedResult> {
    const sourceMap = await this.sourceCodeToIdMap();
    const rtRepo = this.ds.getRepository(RaceTraitEntity);
    const stRepo = this.ds.getRepository(SubraceTraitEntity);
    const raceMap = await this.slugToIdMap(RaceEntity);
    const subraceMap = await this.slugToIdMap(SubraceEntity);
    const errors: { slug: string; message: string }[] = [];
    let totalTraits = 0;
    let success = 0;


    const raceItems = transformRaces();
    const allTraits: Array<{
      slug: string;
      name: string;
      description: string[];
      proficiency_choices: Record<string, unknown> | null;
      trait_specific: Record<string, unknown> | null;
      language_options: Record<string, unknown> | null;
      source_code: string;
      race_slug: string;
      raw: Record<string, unknown>;
    }> = [];
    const subraceTraitLinks: Array<{
      trait_slug: string;
      subrace_slug: string;
    }> = [];

    for (const race of raceItems) {
      const extracted = extractTraitsFromRace({
        raceSlug: race.slug,
        sourceCode: race.source_code,
        srd52: (race.raw as any).srd52,
        entries: (race.raw as any).entries,
        raw: race.raw,
      });
      allTraits.push(...extracted);
    }


    const subraceItems = transformSubraces();
    for (const sub of subraceItems) {
      const extracted = extractTraitsFromSubrace({
        subraceSlug: sub.slug,
        raceSlug: sub.race_slug,
        sourceCode: sub.source_code,
        srd52: (sub.raw as any).srd52,
        entries: (sub.raw as any).entries,
        raw: sub.raw,
      });
      for (const t of extracted) {
        allTraits.push(t);
        subraceTraitLinks.push({ trait_slug: t.slug, subrace_slug: sub.slug });
      }
    }


    const seenSlugs = new Set<string>();
    const uniqueTraits: typeof allTraits = [];
    for (const t of allTraits) {
      if (!seenSlugs.has(t.slug)) {
        seenSlugs.add(t.slug);
        uniqueTraits.push(t);
      }
    }
    totalTraits = uniqueTraits.length;


    for (const item of uniqueTraits) {
      try {
        await this.ds
          .createQueryBuilder()
          .insert()
          .into(TraitEntity)
          .values({
            slug: item.slug,
            name: item.name,
            description: item.description,
            proficiency_choices: (item.proficiency_choices ?? undefined) as any,
            trait_specific: (item.trait_specific ?? undefined) as any,
            language_options: (item.language_options ?? undefined) as any,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          })
          .orUpdate(
            [
              "name",
              "description",
              "proficiency_choices",
              "trait_specific",
              "language_options",
              "source_id",
              "raw",
            ],
            ["slug"],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }


    const traitMap = await this.slugToIdMap(TraitEntity);
    for (const item of allTraits) {
      const traitId = traitMap.get(item.slug);
      const raceId = raceMap.get(item.race_slug);
      if (!traitId || !raceId) continue;
      try {
        await rtRepo.upsert(
          { race_id: raceId, trait_id: traitId },
          { conflictPaths: ["race_id", "trait_id"] },
        );
      } catch (err: any) {
        errors.push({
          slug: `${item.slug}→race:${item.race_slug}`,
          message: err.message,
        });
      }
    }


    for (const link of subraceTraitLinks) {
      const traitId = traitMap.get(link.trait_slug);
      const subraceId = subraceMap.get(link.subrace_slug);
      if (!traitId || !subraceId) continue;
      try {
        await stRepo.upsert(
          { subrace_id: subraceId, trait_id: traitId },
          { conflictPaths: ["subrace_id", "trait_id"] },
        );
      } catch (err: any) {
        errors.push({
          slug: `${link.trait_slug}→subrace:${link.subrace_slug}`,
          message: err.message,
        });
      }
    }

    return this.result("traits", totalTraits, success, errors);
  }

  async seedBackgrounds(): Promise<SeedResult> {
    const items = transformBackgrounds();
    const sourceMap = await this.sourceCodeToIdMap();
    const bgRepo = this.ds.getRepository(BackgroundEntity);
    const bpRepo = this.ds.getRepository(BackgroundProficiencyEntity);
    const featMap = await this.slugToIdMap(FeatEntity);
    const profMap = await this.slugToIdMap(ProficiencyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const sourceId = sourceMap.get(item.source_code) ?? null;
        const featId = item.feat_slug
          ? (featMap.get(item.feat_slug) ?? undefined)
          : undefined;

        await bgRepo.upsert(
          {
            slug: item.slug,
            name: item.name,
            ability_scores: (item.ability_scores
              ? (item.ability_scores as unknown as Record<string, unknown>[])
              : undefined) as any,
            equipment_options: item.equipment_options as any,
            proficiency_choices: undefined,
            feat_id: featId,
            language_choices: (item.language_choices ?? undefined) as any,
            feature: item.feature ?? undefined,
            source_id: sourceId ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );


        const bgId = (await this.slugToId(BackgroundEntity, item.slug))!;
        const allProfSlugs = [
          ...item.skill_proficiency_slugs,
          ...item.tool_proficiency_slugs,
        ];
        for (const profSlug of allProfSlugs) {
          const profId = profMap.get(profSlug);
          if (!profId) continue;
          await bpRepo.upsert(
            { background_id: bgId, proficiency_id: profId },
            { conflictPaths: ["background_id", "proficiency_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("backgrounds", items.length, success, errors);
  }

  async seedOptionalFeatures(): Promise<SeedResult> {
    const items = transformOptionalFeatures();
    const sourceMap = await this.sourceCodeToIdMap();
    const repo = this.ds.getRepository(OptionalFeatureEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const sourceId = sourceMap.get(item.source_code) ?? null;

        await repo.upsert(
          {
            slug: item.slug,
            name: item.name,
            description: item.description,
            feature_type: item.feature_type,
            min_level: item.min_level ?? undefined,
            prerequisite: (item.prerequisite ?? undefined) as any,
            has_sub_choices: item.has_sub_choices,
            sub_choice_type: item.sub_choice_type ?? undefined,
            sub_choice_options: (item.sub_choice_options ?? undefined) as any,
            source_id: sourceId ?? undefined,
            raw: item.raw as any,
          },
          { conflictPaths: ["slug"] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("optional_features", items.length, success, errors);
  }



  async seedFeatures(): Promise<SeedResult> {
    const items = transformFeatures();
    const sourceMap = await this.sourceCodeToIdMap();
    const classMap = await this.slugToIdMap(ClassEntity);
    const subclassMap = await this.slugToIdMap(SubclassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const classId = classMap.get(item.class_slug) ?? undefined;
        const subclassId = item.subclass_slug
          ? (subclassMap.get(item.subclass_slug) ?? undefined)
          : undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(FeatureEntity)
          .values({
            slug: item.slug,
            name: item.name,
            level: item.level,
            description: item.description as any,
            prerequisites: item.prerequisites as any,
            reference: item.reference,
            feature_specific: (item.feature_specific ?? undefined) as any,
            class_id: classId,
            subclass_id: subclassId,
            source_id: sourceMap.get(item.source_code) ?? undefined,
            raw: item.raw as any,
          })
          .orUpdate(
            [
              "name",
              "level",
              "description",
              "prerequisites",
              "reference",
              "feature_specific",
              "class_id",
              "subclass_id",
              "source_id",
              "raw",
            ],
            ["slug"],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }

    return this.result("features", items.length, success, errors);
  }

  async seedSpells(): Promise<SeedResult> {
    const items = transformSpells();
    const sourceMap = await this.sourceCodeToIdMap();
    const schoolMap = await this.slugToIdMap(MagicSchoolEntity);
    const classMap = await this.slugToIdMap(ClassEntity);
    const scRepo = this.ds.getRepository(SpellClassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const attackMap: Record<string, AttackTypeEnum> = {
      melee: AttackTypeEnum.Melee,
      ranged: AttackTypeEnum.Ranged,
    };


    for (const item of items) {
      try {
        const schoolId = item.school_slug
          ? (schoolMap.get(item.school_slug) ?? undefined)
          : undefined;
        const sourceId = sourceMap.get(item.source_code) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(SpellEntity)
          .values({
            slug: item.slug,
            name: item.name,
            description: item.description,
            higher_level: item.higher_level ?? undefined,
            range: item.range,
            components: item.components as any,
            material: item.material ?? undefined,
            ritual: item.ritual,
            duration: item.duration,
            concentration: item.concentration,
            casting_time: item.casting_time,
            level: item.level,
            attack_type: item.attack_type
              ? (attackMap[item.attack_type] ?? undefined)
              : undefined,
            damage: item.damage ?? undefined,
            dc: item.dc ?? undefined,
            heal_at_slot_level: item.heal_at_slot_level ?? undefined,
            area_of_effect: item.area_of_effect ?? undefined,
            school_id: schoolId,
            source_id: sourceId,
            raw: item.raw as any,
          } as any)
          .orUpdate(
            [
              "name",
              "description",
              "higher_level",
              "range",
              "components",
              "material",
              "ritual",
              "duration",
              "concentration",
              "casting_time",
              "level",
              "attack_type",
              "damage",
              "dc",
              "heal_at_slot_level",
              "area_of_effect",
              "school_id",
              "source_id",
              "raw",
            ],
            ["slug"],
          )
          .execute();

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }


    const spellMap = await this.slugToIdMap(SpellEntity);
    const mappings = loadSpellClassMappings();
    let mappingCount = 0;

    for (const m of mappings) {
      try {
        const spellId = spellMap.get(m.spell_slug);
        const classId = classMap.get(m.class_slug);
        if (!spellId || !classId) continue;

        await scRepo.upsert(
          { spell_id: spellId, class_id: classId },
          { conflictPaths: ["spell_id", "class_id"] },
        );
        mappingCount++;
      } catch {

      }
    }

    this.logger.log(`[spell_classes] ${mappingCount} mappings created`);
    return this.result("spells", items.length, success, errors);
  }

  async seedMagicItems(): Promise<SeedResult> {
    const items = transformMagicItems();
    const sourceMap = await this.sourceCodeToIdMap();
    const catMap = await this.slugToIdMap(EquipmentCategoryEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const sourceId = sourceMap.get(item.source_code) ?? undefined;
        const catId = item.category_slug
          ? (catMap.get(item.category_slug) ?? undefined)
          : undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(MagicItemEntity)
          .values({
            slug: item.slug,
            name: item.name,
            rarity: item.rarity as any,
            is_variant: item.is_variant,
            description: item.description as any,
            image: item.image ?? undefined,
            weight: String(item.weight),
            cost: (item.cost ?? undefined) as any,
            attunement: (item.attunement ?? undefined) as any,
            bonuses: (item.bonuses ?? undefined) as any,
            charges_info: (item.charges_info ?? undefined) as any,
            equipment_category_id: catId,
            source_id: sourceId,
            raw: item.raw as any,
          })
          .orUpdate(
            [
              "name",
              "rarity",
              "is_variant",
              "description",
              "image",
              "weight",
              "cost",
              "attunement",
              "bonuses",
              "charges_info",
              "equipment_category_id",
              "source_id",
              "raw",
            ],
            ["slug"],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }

    return this.result("magic_items", items.length, success, errors);
  }

  async seedMonsters(): Promise<SeedResult> {
    const filesets = transformMonstersByFile();
    const sourceMap = await this.sourceCodeToIdMap();
    const errors: { slug: string; message: string }[] = [];
    let success = 0;
    let total = 0;
    const BATCH_SIZE = 80;

    for (const { file, monsters } of filesets) {
      this.logger.log(
        `[monsters] Processing ${file} (${monsters.length} monsters)`,
      );
      total += monsters.length;

      for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
        const batch = monsters.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
          try {
            const sourceId = sourceMap.get(item.source_code) ?? undefined;

            await this.ds
              .createQueryBuilder()
              .insert()
              .into(MonsterEntity)
              .values({
                slug: item.slug,
                name: item.name,
                size: item.size,
                type: item.type,
                subtype: item.subtype ?? undefined,
                alignment: item.alignment,
                armor_class: item.armor_class as any,
                hit_points: item.hit_points,
                hit_dice: item.hit_dice,
                hit_points_roll: item.hit_points_roll,
                speed: item.speed as any,
                strength: item.strength,
                dexterity: item.dexterity,
                constitution: item.constitution,
                intelligence: item.intelligence,
                wisdom: item.wisdom,
                charisma: item.charisma,
                proficiencies: item.proficiencies as any,
                damage_vulnerabilities: item.damage_vulnerabilities as any,
                damage_resistances: item.damage_resistances as any,
                damage_immunities: item.damage_immunities as any,
                condition_immunities: item.condition_immunities as any,
                senses: item.senses as any,
                languages: item.languages,
                proficiency_bonus: item.proficiency_bonus,
                xp: item.xp,
                special_abilities: (item.special_abilities ?? undefined) as any,
                actions: (item.actions ?? undefined) as any,
                legendary_actions: (item.legendary_actions ?? undefined) as any,
                reactions: (item.reactions ?? undefined) as any,
                image: item.image ?? undefined,
                description: item.description ?? undefined,
                challenge_rating: item.challenge_rating,
                source_id: sourceId,
                raw: item.raw as any,
              })
              .orUpdate(
                [
                  "name",
                  "size",
                  "type",
                  "subtype",
                  "alignment",
                  "armor_class",
                  "hit_points",
                  "hit_dice",
                  "hit_points_roll",
                  "speed",
                  "strength",
                  "dexterity",
                  "constitution",
                  "intelligence",
                  "wisdom",
                  "charisma",
                  "proficiencies",
                  "damage_vulnerabilities",
                  "damage_resistances",
                  "damage_immunities",
                  "condition_immunities",
                  "senses",
                  "languages",
                  "proficiency_bonus",
                  "xp",
                  "special_abilities",
                  "actions",
                  "legendary_actions",
                  "reactions",
                  "image",
                  "description",
                  "challenge_rating",
                  "source_id",
                  "raw",
                ],
                ["slug"],
              )
              .execute();
            success++;
          } catch (err: any) {
            errors.push({ slug: item.slug, message: err.message });
          }
        }
      }
    }

    this.logger.log(
      `[monsters] Total: ${total}, Success: ${success}, Errors: ${errors.length}`,
    );
    return this.result("monsters", total, success, errors);
  }



  async seedLevels(): Promise<SeedResult> {
    const items = transformLevels();
    const sourceMap = await this.sourceCodeToIdMap();
    const classMap = await this.slugToIdMap(ClassEntity);
    const featureMap = await this.slugToIdMap(FeatureEntity);
    const lfRepo = this.ds.getRepository(LevelFeatureEntity);
    const levelRepo = this.ds.getRepository(LevelEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of items) {
      try {
        const classId = classMap.get(item.class_slug) ?? undefined;


        const existing = await levelRepo.findOne({
          where: { slug: item.slug },
        });

        let levelId: string;

        if (existing) {
          await this.ds
            .createQueryBuilder()
            .update(LevelEntity)
            .set({
              level: item.level,
              ability_score_bonuses: item.ability_score_bonuses,
              prof_bonus: item.prof_bonus,
              spellcasting: (item.spellcasting ?? undefined) as any,
              class_specific: (item.class_specific ?? undefined) as any,
              class_id: classId,
              source_id: sourceMap.get(item.source_code) ?? undefined,
              raw: item.raw as any,
            })
            .where("id = :id", { id: existing.id })
            .execute();
          levelId = existing.id;
        } else {
          const result = await this.ds
            .createQueryBuilder()
            .insert()
            .into(LevelEntity)
            .values({
              slug: item.slug,
              level: item.level,
              ability_score_bonuses: item.ability_score_bonuses,
              prof_bonus: item.prof_bonus,
              spellcasting: (item.spellcasting ?? undefined) as any,
              class_specific: (item.class_specific ?? undefined) as any,
              class_id: classId,
              source_id: sourceMap.get(item.source_code) ?? undefined,
              raw: item.raw as any,
            })
            .returning("id")
            .execute();
          levelId = result.identifiers[0].id;
        }


        for (const featureSlug of item.feature_slugs) {
          const featureId = featureMap.get(featureSlug);
          if (!featureId) continue;
          await lfRepo.upsert(
            { level_id: levelId, feature_id: featureId },
            { conflictPaths: ["level_id", "feature_id"] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.slug, message: err.message });
      }
    }
    return this.result("levels", items.length, success, errors);
  }
}
