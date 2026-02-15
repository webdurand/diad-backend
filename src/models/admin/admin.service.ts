import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

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
  EldritchInvocationEntity,
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
} from '../../entities';

// ────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ────────────────────────────────────────────────────────────────
export interface SeedResult {
  entity: string;
  total: number;
  success: number;
  errors: { slug: string; message: string }[];
}

type JsonRef = { index: string; name?: string; url?: string };

// ────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly jsonDir = path.resolve(process.cwd(), 'src/data/json');

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ──────────── helpers ────────────

  private loadJson<T = any>(filename: string): T {
    const filePath = path.join(this.jsonDir, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  private async getOrCreateSource(): Promise<string> {
    const repo = this.ds.getRepository(CompSourceEntity);
    let source = await repo.findOne({ where: { code: 'SRD' } });
    if (!source) {
      source = repo.create({
        code: 'SRD',
        name: 'System Reference Document 5e',
      });
      source = await repo.save(source);
    }
    return source.id;
  }

  private async slugToId(
    entity: new () => any,
    slug: string,
  ): Promise<string | null> {
    const row = await this.ds
      .getRepository(entity)
      .findOne({ where: { slug } as any });
    return row ? (row as any).id : null;
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

  // ──────────── Fase 0 — CompSource ────────────

  async seedCompSources(): Promise<SeedResult> {
    await this.getOrCreateSource();
    return this.result('comp_sources', 1, 1, []);
  }

  // ──────────── Fase 1 — Sem dependências ────────────

  async seedAbilityScores(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Ability-Scores.json');
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('ability_scores', data.length, success, errors);
  }

  async seedAlignments(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Alignments.json');
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('alignments', data.length, success, errors);
  }

  async seedConditions(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Conditions.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(ConditionEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description,
            url: item.url ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('conditions', data.length, success, errors);
  }

  async seedDamageTypes(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Damage-Types.json');
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('damage_types', data.length, success, errors);
  }

  async seedLanguages(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Languages.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(LanguageEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            is_rare: item.is_rare ?? false,
            note: item.note || null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('languages', data.length, success, errors);
  }

  async seedMagicSchools(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Magic-Schools.json');
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('magic_schools', data.length, success, errors);
  }

  async seedWeaponProperties(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Weapon-Properties.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(WeaponPropertyEntity);
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('weapon_properties', data.length, success, errors);
  }

  async seedWeaponMasteryProperties(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Weapon-Mastery-Properties.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(WeaponMasteryPropertyEntity);
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result(
      'weapon_mastery_properties',
      data.length,
      success,
      errors,
    );
  }

  async seedRuleSections(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Rule-Sections.json');
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('rule_sections', data.length, success, errors);
  }

  async seedEquipmentCategories(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Equipment-Categories.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(EquipmentCategoryEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('equipment_categories', data.length, success, errors);
  }

  async seedProficiencies(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Proficiencies.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(ProficiencyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const typeMap: Record<string, ProficiencyTypeEnum> = {
      Armor: ProficiencyTypeEnum.Armor,
      Weapon: ProficiencyTypeEnum.Weapon,
      Skill: ProficiencyTypeEnum.Skill,
      Tool: ProficiencyTypeEnum.Tool,
      'Saving Throws': ProficiencyTypeEnum.SavingThrow,
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
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('proficiencies', data.length, success, errors);
  }

  // ──────────── Fase 2 — Dependem da Fase 1 ────────────

  async seedSkills(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Skills.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(SkillEntity);
    const abilityMap = await this.slugToIdMap(AbilityScoreEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        const abilityId =
          abilityMap.get(item.ability_score?.index) ?? undefined;
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description,
            ability_score_id: abilityId,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('skills', data.length, success, errors);
  }

  async seedEquipment(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Equipment.json');
    const sourceId = await this.getOrCreateSource();
    const eqRepo = this.ds.getRepository(EquipmentEntity);
    const catMap = await this.slugToIdMap(EquipmentCategoryEntity);
    const eciRepo = this.ds.getRepository(EquipmentCategoryItemEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await eqRepo.upsert(
          {
            slug: item.index,
            name: item.name,
            weight: item.weight != null ? String(item.weight) : '0',
            description: item.description ?? null,
            image: item.image ?? null,
            cost: item.cost ?? { quantity: 0, unit: 'gp' },
            damage: item.damage ?? null,
            armor_class: item.armor_class ?? null,
            properties: item.properties ?? null,
            utilize: item.utilize ?? null,
            contents: item.contents ?? null,
            craft: item.craft ?? null,
            range: item.range ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );

        // Junção equipment_category_items
        const eqId = (await this.slugToId(EquipmentEntity, item.index))!;
        const categories: JsonRef[] = item.equipment_categories ?? [];
        for (const cat of categories) {
          const catId = catMap.get(cat.index);
          if (!catId) continue;
          await eciRepo.upsert(
            { equipment_id: eqId, category_id: catId },
            { conflictPaths: ['equipment_id', 'category_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('equipments', data.length, success, errors);
  }

  async seedFeats(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Feats.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(FeatEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const typeMap: Record<string, FeatTypeEnum> = {
      origin: FeatTypeEnum.Origin,
      general: FeatTypeEnum.General,
      epic_boon: FeatTypeEnum.EpicBoon,
      'epic-boon': FeatTypeEnum.EpicBoon,
      'fighting-style': FeatTypeEnum.FightingStyle,
    };

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description ?? '',
            feat_type: typeMap[item.type] ?? FeatTypeEnum.Other,
            repeatable: item.repeatable ?? null,
            prerequisites: item.prerequisites ?? null,
            prerequisite_options: item.prerequisite_options ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('feats', data.length, success, errors);
  }

  async seedRules(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Rules.json');
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
          { conflictPaths: ['slug'] },
        );

        const ruleId = (await this.slugToId(RuleEntity, item.index))!;
        const subs: JsonRef[] = item.subsections ?? [];
        for (const sub of subs) {
          const sectionId = sectionMap.get(sub.index);
          if (!sectionId) continue;
          await linkRepo.upsert(
            { rule_id: ruleId, section_id: sectionId },
            { conflictPaths: ['rule_id', 'section_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('rules', data.length, success, errors);
  }

  // ──────────── Fase 3 — Classes e Races ────────────

  async seedClasses(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Classes.json');
    const sourceId = await this.getOrCreateSource();
    const classRepo = this.ds.getRepository(ClassEntity);
    const cpRepo = this.ds.getRepository(ClassProficiencyEntity);
    const csRepo = this.ds.getRepository(ClassSavingThrowEntity);
    const ceRepo = this.ds.getRepository(ClassStartingEquipmentEntity);
    const profMap = await this.slugToIdMap(ProficiencyEntity);
    const abilityMap = await this.slugToIdMap(AbilityScoreEntity);
    const eqMap = await this.slugToIdMap(EquipmentEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await classRepo.upsert(
          {
            slug: item.index,
            name: item.name,
            hit_die: item.hit_die,
            proficiency_choices: item.proficiency_choices ?? {},
            starting_equipment_options: item.starting_equipment_options ?? null,
            class_levels_url: item.class_levels ?? null,
            multi_classing: item.multi_classing ?? {},
            spellcasting: item.spellcasting ?? null,
            spells_url: item.spells ?? null,
            weapon_mastery_count: item.weapon_mastery_count ?? 0,
            weapon_mastery_restriction: item.weapon_mastery_restriction ?? null,
            cantrips_known: item.cantrips_known ?? 0,
            spells_prepared_count: item.spells_prepared_count ?? 0,
            spellbook_count: item.spellbook_count ?? 0,
            class_features_level_1: item.class_features_level_1 ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );

        const classId = (await this.slugToId(ClassEntity, item.index))!;

        // class_proficiencies
        const profs: JsonRef[] = item.proficiencies ?? [];
        for (const p of profs) {
          const profId = profMap.get(p.index);
          if (!profId) continue;
          await cpRepo.upsert(
            { class_id: classId, proficiency_id: profId },
            { conflictPaths: ['class_id', 'proficiency_id'] },
          );
        }

        // class_saving_throws
        const saves: JsonRef[] = item.saving_throws ?? [];
        for (const s of saves) {
          const abilityId = abilityMap.get(s.index);
          if (!abilityId) continue;
          await csRepo.upsert(
            { class_id: classId, ability_score_id: abilityId },
            { conflictPaths: ['class_id', 'ability_score_id'] },
          );
        }

        // class_starting_equipment
        const startEq: any[] = item.starting_equipment ?? [];
        for (const se of startEq) {
          const eqSlug = se.equipment?.index;
          if (!eqSlug) continue;
          const eqId = eqMap.get(eqSlug);
          if (!eqId) continue;
          await ceRepo.upsert(
            { class_id: classId, equipment_id: eqId },
            { conflictPaths: ['class_id', 'equipment_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('classes', data.length, success, errors);
  }

  async seedRaces(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Races.json');
    const sourceId = await this.getOrCreateSource();
    const raceRepo = this.ds.getRepository(RaceEntity);
    const rlRepo = this.ds.getRepository(RaceLanguageEntity);
    const langMap = await this.slugToIdMap(LanguageEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await raceRepo.upsert(
          {
            slug: item.index,
            name: item.name,
            speed: item.speed,
            ability_bonuses: item.ability_bonuses ?? [],
            age: item.age,
            size: item.size,
            size_description: item.size_description,
            language_options: item.language_options ?? null,
            language_desc: item.language_desc,
            ability_bonus_options: item.ability_bonus_options ?? null,
            alignment: item.alignment,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );

        const raceId = (await this.slugToId(RaceEntity, item.index))!;

        // race_languages
        const langs: JsonRef[] = item.languages ?? [];
        for (const l of langs) {
          const langId = langMap.get(l.index);
          if (!langId) continue;
          await rlRepo.upsert(
            { race_id: raceId, language_id: langId },
            { conflictPaths: ['race_id', 'language_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('races', data.length, success, errors);
  }

  // ──────────── Fase 4 — Subclasses, Subraces, Traits, Backgrounds ──────────

  async seedSubclasses(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Subclasses.json');
    const sourceId = await this.getOrCreateSource();
    const classMap = await this.slugToIdMap(ClassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        const classId = classMap.get(item.class?.index) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(SubclassEntity)
          .values({
            slug: item.index,
            name: item.name,
            subclass_flavor: item.subclass_flavor,
            description: item.desc ?? [],
            subclass_levels_url: item.subclass_levels ?? null,
            spells: item.spells ?? null,
            class_id: classId,
            source_id: sourceId,
            raw: item,
          })
          .orUpdate(
            [
              'name',
              'subclass_flavor',
              'description',
              'subclass_levels_url',
              'spells',
              'class_id',
              'source_id',
              'raw',
            ],
            ['slug'],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('subclasses', data.length, success, errors);
  }

  async seedSubraces(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Subraces.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(SubraceEntity);
    const raceMap = await this.slugToIdMap(RaceEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        const raceId = raceMap.get(item.race?.index) ?? undefined;
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.desc ?? '',
            ability_bonuses: item.ability_bonuses ?? [],
            url: item.url ?? null,
            race_id: raceId,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('subraces', data.length, success, errors);
  }

  async seedTraits(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Traits.json');
    const sourceId = await this.getOrCreateSource();
    const profMap = await this.slugToIdMap(ProficiencyEntity);
    const tpRepo = this.ds.getRepository(TraitProficiencyEntity);
    const rtRepo = this.ds.getRepository(RaceTraitEntity);
    const stRepo = this.ds.getRepository(SubraceTraitEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    // Passe 1 — inserir todos sem parent_id
    for (const item of data) {
      try {
        await this.ds
          .createQueryBuilder()
          .insert()
          .into(TraitEntity)
          .values({
            slug: item.index,
            name: item.name,
            description: item.desc ?? [],
            proficiency_choices: item.proficiency_choices ?? null,
            trait_specific: item.trait_specific ?? null,
            language_options: item.language_options ?? null,
            source_id: sourceId,
            raw: item,
          })
          .orUpdate(
            [
              'name',
              'description',
              'proficiency_choices',
              'trait_specific',
              'language_options',
              'source_id',
              'raw',
            ],
            ['slug'],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }

    // Passe 2 — atualizar parent_id
    const traitMap = await this.slugToIdMap(TraitEntity);
    for (const item of data) {
      if (!item.parent?.index) continue;
      try {
        const traitId = traitMap.get(item.index);
        const parentId = traitMap.get(item.parent.index);
        if (traitId && parentId) {
          await this.ds
            .createQueryBuilder()
            .update(TraitEntity)
            .set({ parent_id: parentId })
            .where('id = :id', { id: traitId })
            .execute();
        }
      } catch (err: any) {
        errors.push({
          slug: `${item.index}→parent`,
          message: err.message,
        });
      }
    }

    // Passe 3 — junções
    const raceMap = await this.slugToIdMap(RaceEntity);
    const subraceMap = await this.slugToIdMap(SubraceEntity);

    for (const item of data) {
      const traitId = traitMap.get(item.index);
      if (!traitId) continue;

      // trait_proficiencies
      const profs: JsonRef[] = item.proficiencies ?? [];
      for (const p of profs) {
        const profId = profMap.get(p.index);
        if (!profId) continue;
        try {
          await tpRepo.upsert(
            { trait_id: traitId, proficiency_id: profId },
            { conflictPaths: ['trait_id', 'proficiency_id'] },
          );
        } catch (err: any) {
          errors.push({
            slug: `${item.index}→prof:${p.index}`,
            message: err.message,
          });
        }
      }

      // race_traits
      const races: JsonRef[] = item.races ?? [];
      for (const r of races) {
        const raceId = raceMap.get(r.index);
        if (!raceId) continue;
        try {
          await rtRepo.upsert(
            { race_id: raceId, trait_id: traitId },
            { conflictPaths: ['race_id', 'trait_id'] },
          );
        } catch (err: any) {
          errors.push({
            slug: `${item.index}→race:${r.index}`,
            message: err.message,
          });
        }
      }

      // subrace_traits
      const subs: JsonRef[] = item.subraces ?? [];
      for (const s of subs) {
        const subraceId = subraceMap.get(s.index);
        if (!subraceId) continue;
        try {
          await stRepo.upsert(
            { subrace_id: subraceId, trait_id: traitId },
            { conflictPaths: ['subrace_id', 'trait_id'] },
          );
        } catch (err: any) {
          errors.push({
            slug: `${item.index}→subrace:${s.index}`,
            message: err.message,
          });
        }
      }
    }

    return this.result('traits', data.length, success, errors);
  }

  async seedBackgrounds(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Backgrounds.json');
    const sourceId = await this.getOrCreateSource();
    const bgRepo = this.ds.getRepository(BackgroundEntity);
    const bpRepo = this.ds.getRepository(BackgroundProficiencyEntity);
    const featMap = await this.slugToIdMap(FeatEntity);
    const profMap = await this.slugToIdMap(ProficiencyEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        const featId = featMap.get(item.feat?.index) ?? undefined;

        await bgRepo.upsert(
          {
            slug: item.index,
            name: item.name,
            ability_scores: item.ability_scores ?? null,
            equipment_options: item.equipment_options ?? {},
            proficiency_choices: item.proficiency_choices ?? null,
            feat_id: featId,
            language_choices: item.language_choices ?? null,
            feature: item.feature ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );

        const bgId = (await this.slugToId(BackgroundEntity, item.index))!;
        const profs: JsonRef[] = item.proficiencies ?? [];
        for (const p of profs) {
          const profId = profMap.get(p.index);
          if (!profId) continue;
          await bpRepo.upsert(
            { background_id: bgId, proficiency_id: profId },
            { conflictPaths: ['background_id', 'proficiency_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('backgrounds', data.length, success, errors);
  }

  async seedEldritchInvocations(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Eldritch-Invocations.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(EldritchInvocationEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            description: item.description ?? '',
            min_level: item.min_level ?? null,
            prerequisite: item.prerequisite ?? null,
            has_sub_choices: item.has_sub_choices ?? false,
            sub_choice_type: item.sub_choice_type ?? null,
            sub_choice_options: item.sub_choice_options ?? null,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('eldritch_invocations', data.length, success, errors);
  }

  // ──────────── Fase 5 — Features, Spells, MagicItems, Monsters ─────────────

  async seedFeatures(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Features.json');
    const sourceId = await this.getOrCreateSource();
    const classMap = await this.slugToIdMap(ClassEntity);
    const subclassMap = await this.slugToIdMap(SubclassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    // Passe 1 — inserir todos sem parent_id
    for (const item of data) {
      try {
        const classId = classMap.get(item.class?.index) ?? undefined;
        const subclassId = subclassMap.get(item.subclass?.index) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(FeatureEntity)
          .values({
            slug: item.index,
            name: item.name,
            level: item.level,
            description: item.desc ?? [],
            prerequisites: item.prerequisites ?? [],
            reference: item.url ?? null,
            feature_specific: item.feature_specific ?? null,
            class_id: classId,
            subclass_id: subclassId,
            source_id: sourceId,
            raw: item,
          })
          .orUpdate(
            [
              'name',
              'level',
              'description',
              'prerequisites',
              'reference',
              'feature_specific',
              'class_id',
              'subclass_id',
              'source_id',
              'raw',
            ],
            ['slug'],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }

    // Passe 2 — atualizar parent_id
    const featureMap = await this.slugToIdMap(FeatureEntity);
    for (const item of data) {
      if (!item.parent?.index) continue;
      try {
        const featureId = featureMap.get(item.index);
        const parentId = featureMap.get(item.parent.index);
        if (featureId && parentId) {
          await this.ds
            .createQueryBuilder()
            .update(FeatureEntity)
            .set({ parent_id: parentId })
            .where('id = :id', { id: featureId })
            .execute();
        }
      } catch (err: any) {
        errors.push({
          slug: `${item.index}→parent`,
          message: err.message,
        });
      }
    }

    return this.result('features', data.length, success, errors);
  }

  async seedSpells(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Spells.json');
    const sourceId = await this.getOrCreateSource();
    const schoolMap = await this.slugToIdMap(MagicSchoolEntity);
    const classMap = await this.slugToIdMap(ClassEntity);
    const subclassMap = await this.slugToIdMap(SubclassEntity);
    const scRepo = this.ds.getRepository(SpellClassEntity);
    const ssRepo = this.ds.getRepository(SpellSubclassEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    const attackMap: Record<string, AttackTypeEnum> = {
      melee: AttackTypeEnum.Melee,
      ranged: AttackTypeEnum.Ranged,
    };

    for (const item of data) {
      try {
        const schoolId = schoolMap.get(item.school?.index) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(SpellEntity)
          .values({
            slug: item.index,
            name: item.name,
            description: item.desc ?? [],
            higher_level: item.higher_level ?? null,
            range: item.range,
            components: item.components ?? [],
            material: item.material ?? null,
            ritual: item.ritual ?? false,
            duration: item.duration,
            concentration: item.concentration ?? false,
            casting_time: item.casting_time,
            level: item.level,
            attack_type: attackMap[item.attack_type] ?? null,
            damage: item.damage ?? null,
            url: item.url ?? null,
            dc: item.dc ?? null,
            heal_at_slot_level: item.heal_at_slot_level ?? null,
            area_of_effect: item.area_of_effect ?? null,
            school_id: schoolId,
            source_id: sourceId,
            raw: item,
          })
          .orUpdate(
            [
              'name',
              'description',
              'higher_level',
              'range',
              'components',
              'material',
              'ritual',
              'duration',
              'concentration',
              'casting_time',
              'level',
              'attack_type',
              'damage',
              'url',
              'dc',
              'heal_at_slot_level',
              'area_of_effect',
              'school_id',
              'source_id',
              'raw',
            ],
            ['slug'],
          )
          .execute();

        // Junções
        const spellId = (await this.slugToId(SpellEntity, item.index))!;

        const classes: JsonRef[] = item.classes ?? [];
        for (const c of classes) {
          const cId = classMap.get(c.index);
          if (!cId) continue;
          await scRepo.upsert(
            { spell_id: spellId, class_id: cId },
            { conflictPaths: ['spell_id', 'class_id'] },
          );
        }

        const subclasses: JsonRef[] = item.subclasses ?? [];
        for (const sc of subclasses) {
          const scId = subclassMap.get(sc.index);
          if (!scId) continue;
          await ssRepo.upsert(
            { spell_id: spellId, subclass_id: scId },
            { conflictPaths: ['spell_id', 'subclass_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('spells', data.length, success, errors);
  }

  async seedMagicItems(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Magic-Items.json');
    const sourceId = await this.getOrCreateSource();
    const catMap = await this.slugToIdMap(EquipmentCategoryEntity);
    const mvRepo = this.ds.getRepository(MagicItemVariantEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    // Passe 1 — inserir todos
    for (const item of data) {
      try {
        const catId = catMap.get(item.equipment_category?.index) ?? undefined;

        await this.ds
          .createQueryBuilder()
          .insert()
          .into(MagicItemEntity)
          .values({
            slug: item.index,
            name: item.name,
            rarity: item.rarity ?? {},
            is_variant: item.variant ?? false,
            description: item.desc ?? [],
            image: item.image ?? null,
            url: item.url ?? null,
            equipment_category_id: catId,
            source_id: sourceId,
            raw: item,
          })
          .orUpdate(
            [
              'name',
              'rarity',
              'is_variant',
              'description',
              'image',
              'url',
              'equipment_category_id',
              'source_id',
              'raw',
            ],
            ['slug'],
          )
          .execute();
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }

    // Passe 2 — magic_item_variants
    const miMap = await this.slugToIdMap(MagicItemEntity);
    for (const item of data) {
      const variants: JsonRef[] = item.variants ?? [];
      if (!variants.length) continue;
      const parentId = miMap.get(item.index);
      if (!parentId) continue;

      for (const v of variants) {
        const variantId = miMap.get(v.index);
        if (!variantId) continue;
        try {
          await mvRepo.upsert(
            {
              magic_item_id: parentId,
              variant_magic_item_id: variantId,
            },
            {
              conflictPaths: ['magic_item_id', 'variant_magic_item_id'],
            },
          );
        } catch (err: any) {
          errors.push({
            slug: `${item.index}→variant:${v.index}`,
            message: err.message,
          });
        }
      }
    }

    return this.result('magic_items', data.length, success, errors);
  }

  async seedMonsters(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Monsters.json');
    const sourceId = await this.getOrCreateSource();
    const repo = this.ds.getRepository(MonsterEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await repo.upsert(
          {
            slug: item.index,
            name: item.name,
            size: item.size,
            type: item.type,
            subtype: item.subtype ?? null,
            alignment: item.alignment,
            armor_class: item.armor_class ?? [],
            hit_points: item.hit_points,
            hit_dice: item.hit_dice,
            hit_points_roll: item.hit_points_roll,
            speed: item.speed ?? {},
            strength: item.strength,
            dexterity: item.dexterity,
            constitution: item.constitution,
            intelligence: item.intelligence,
            wisdom: item.wisdom,
            charisma: item.charisma,
            proficiencies: item.proficiencies ?? [],
            damage_vulnerabilities: item.damage_vulnerabilities ?? [],
            damage_resistances: item.damage_resistances ?? [],
            damage_immunities: item.damage_immunities ?? [],
            condition_immunities: item.condition_immunities ?? [],
            senses: item.senses ?? {},
            languages: item.languages ?? '',
            proficiency_bonus: item.proficiency_bonus ?? 0,
            xp: item.xp ?? 0,
            special_abilities: item.special_abilities ?? null,
            actions: item.actions ?? null,
            legendary_actions: item.legendary_actions ?? null,
            reactions: item.reactions ?? null,
            forms: item.forms ?? null,
            image: item.image ?? null,
            description: item.desc ?? null,
            challenge_rating: item.challenge_rating ?? 0,
            source_id: sourceId,
            raw: item,
          },
          { conflictPaths: ['slug'] },
        );
        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('monsters', data.length, success, errors);
  }

  // ──────────── Fase 6 — Levels ────────────

  async seedLevels(): Promise<SeedResult> {
    const data = this.loadJson<any[]>('5e-SRD-Levels.json');
    const sourceId = await this.getOrCreateSource();
    const classMap = await this.slugToIdMap(ClassEntity);
    const subclassMap = await this.slugToIdMap(SubclassEntity);
    const featureMap = await this.slugToIdMap(FeatureEntity);
    const lfRepo = this.ds.getRepository(LevelFeatureEntity);
    const levelRepo = this.ds.getRepository(LevelEntity);
    const errors: { slug: string; message: string }[] = [];
    let success = 0;

    for (const item of data) {
      try {
        const classId = classMap.get(item.class?.index) ?? undefined;
        const subclassId = subclassMap.get(item.subclass?.index) ?? undefined;

        // slug não é unique em levels — find+update ou insert
        const existing = await levelRepo.findOne({
          where: { slug: item.index },
        });

        let levelId: string;

        if (existing) {
          await this.ds
            .createQueryBuilder()
            .update(LevelEntity)
            .set({
              level: item.level,
              url: item.url ?? null,
              ability_score_bonuses: item.ability_score_bonuses ?? 0,
              prof_bonus: item.prof_bonus ?? null,
              spellcasting: item.spellcasting ?? null,
              class_specific: item.class_specific ?? null,
              subclass_specific: item.subclass_specific ?? null,
              class_id: classId,
              subclass_id: subclassId,
              source_id: sourceId,
              raw: item,
            })
            .where('id = :id', { id: existing.id })
            .execute();
          levelId = existing.id;
        } else {
          const result = await this.ds
            .createQueryBuilder()
            .insert()
            .into(LevelEntity)
            .values({
              slug: item.index,
              level: item.level,
              url: item.url ?? null,
              ability_score_bonuses: item.ability_score_bonuses ?? 0,
              prof_bonus: item.prof_bonus ?? null,
              spellcasting: item.spellcasting ?? null,
              class_specific: item.class_specific ?? null,
              subclass_specific: item.subclass_specific ?? null,
              class_id: classId,
              subclass_id: subclassId,
              source_id: sourceId,
              raw: item,
            })
            .returning('id')
            .execute();
          levelId = result.identifiers[0].id;
        }

        // level_features
        const features: JsonRef[] = item.features ?? [];
        for (const f of features) {
          const featureId = featureMap.get(f.index);
          if (!featureId) continue;
          await lfRepo.upsert(
            { level_id: levelId, feature_id: featureId },
            { conflictPaths: ['level_id', 'feature_id'] },
          );
        }

        success++;
      } catch (err: any) {
        errors.push({ slug: item.index, message: err.message });
      }
    }
    return this.result('levels', data.length, success, errors);
  }
}
