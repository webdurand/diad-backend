import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterSkillEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterStateEntity,
  CharacterOriginEntity,
  ClassEntity,
  AbilityScoreEntity,
  SkillEntity,
  ProficiencyEntity,
  SpellEntity,
  RaceEntity,
  SubraceEntity,
  BackgroundEntity,
  AlignmentEntity,
} from 'src/entities';
import {
  CharacterProficiencySourceEnum,
  SpellSourceEnum,
  SpellStatusEnum,
} from 'src/entities/enums';

interface CharacterChoicesData {
  raceIndex?: string;
  subraceIndex?: string;
  classIndex?: string;
  backgroundIndex?: string;
  alignmentIndex?: string;
  abilityScores?: Record<string, number>;
  abilityScoreMethod?: string;
  backgroundAbilityBonuses?: Array<{
    abilityScoreIndex: string;
    bonus: number;
  }>;
  skills?: string[];
  expertiseSkills?: string[];
  raceProficiencyChoices?: string[];
  backgroundProficiencyChoices?: string[];
  classCantrips?: string[];
  classPreparedSpells?: string[];
  classSpellbook?: string[];
  raceSpellChoices?: string[];
  personality?: Record<string, string>;
  speciesSize?: string;
  speciesSpellcastingAbility?: string;
  age?: string;
  height?: string;
  weight?: string;
  raceTraitChoices?: string[];
  raceFeatChoiceIndex?: string;
  raceLanguageChoices?: string[];
  divineOrder?: string;
  primalOrder?: string;
  fightingStyleIndex?: string;
  classEquipmentChoices?: string[];
  backgroundEquipmentChoices?: string[];
  classStartingGold?: Record<string, unknown>;
  eldritchInvocations?: string[];
  eldritchInvocationSubChoices?: Record<string, unknown>;
  weaponMasteryChoices?: string[];
  classLanguageChoices?: string[];
  classToolProficiency?: string;
}

interface CreateCharacterInput {
  userId: string;
  name: string;
  data: Record<string, unknown>;
}

interface UpdateCharacterInput {
  name?: string;
}

const SLUG_MAP: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

@Injectable()
export class CharactersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepository: Repository<CharacterEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(RaceEntity)
    private readonly raceRepository: Repository<RaceEntity>,
    @InjectRepository(SubraceEntity)
    private readonly subraceRepository: Repository<SubraceEntity>,
    @InjectRepository(BackgroundEntity)
    private readonly backgroundRepository: Repository<BackgroundEntity>,
    @InjectRepository(AlignmentEntity)
    private readonly alignmentRepository: Repository<AlignmentEntity>,
    @InjectRepository(AbilityScoreEntity)
    private readonly abilityScoreRepository: Repository<AbilityScoreEntity>,
    @InjectRepository(SkillEntity)
    private readonly skillRepository: Repository<SkillEntity>,
    @InjectRepository(ProficiencyEntity)
    private readonly proficiencyRepository: Repository<ProficiencyEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepository: Repository<SpellEntity>,
  ) {}

  async listByUser(userId: string): Promise<CharacterEntity[]> {
    return this.characterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(userId: string, id: string): Promise<CharacterEntity> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }
    return character;
  }

  async create(input: CreateCharacterInput): Promise<CharacterEntity> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Nome do personagem e obrigatorio.');
    }

    const choices = input.data as unknown as CharacterChoicesData;

    return this.dataSource.transaction(async (manager) => {
      // Create character record (keep data as backup)
      const character = manager.create(CharacterEntity, {
        userId: input.userId,
        name: input.name.trim(),
        data: input.data,
      });
      const saved = await manager.save(CharacterEntity, character);
      const charId = saved.id;

      // Resolve slugs
      const classEntity = choices.classIndex
        ? await this.classRepository.findOneBy({ slug: choices.classIndex })
        : null;
      const raceEntity = choices.raceIndex
        ? await this.raceRepository.findOneBy({ slug: choices.raceIndex })
        : null;
      const subraceEntity = choices.subraceIndex
        ? await this.subraceRepository.findOneBy({ slug: choices.subraceIndex })
        : null;
      const backgroundEntity = choices.backgroundIndex
        ? await this.backgroundRepository.findOneBy({
            slug: choices.backgroundIndex,
          })
        : null;
      const alignmentEntity = choices.alignmentIndex
        ? await this.alignmentRepository.findOneBy({
            slug: choices.alignmentIndex,
          })
        : null;

      if (!classEntity || !raceEntity || !backgroundEntity) {
        return saved;
      }

      // character_classes
      await manager.save(CharacterClassEntity, {
        character_id: charId,
        class_id: classEntity.id,
        class_level: 1,
        order: 1,
      });

      // character_ability_scores
      const bgBonuses = choices.backgroundAbilityBonuses ?? [];
      if (choices.abilityScores) {
        for (const [key, value] of Object.entries(choices.abilityScores)) {
          const slug = SLUG_MAP[key];
          if (!slug) continue;
          const asEntity = await this.abilityScoreRepository.findOneBy({
            slug,
          });
          if (!asEntity) continue;
          const bgBonus =
            bgBonuses.find((b) => b.abilityScoreIndex === slug)?.bonus ?? 0;
          await manager.save(CharacterAbilityScoreEntity, {
            character_id: charId,
            ability_score_id: asEntity.id,
            base_score: value,
            bonus: bgBonus,
          });
        }
      }

      // character_skills
      const skillSlugs = choices.skills ?? [];
      const expertiseSlugs = new Set(choices.expertiseSkills ?? []);
      for (const slug of skillSlugs) {
        const skillEntity = await this.skillRepository.findOneBy({ slug });
        if (!skillEntity) continue;
        await manager.save(CharacterSkillEntity, {
          character_id: charId,
          skill_id: skillEntity.id,
          expertise: expertiseSlugs.has(slug),
        });
      }
      // expertise not in main skills
      for (const slug of expertiseSlugs) {
        if (skillSlugs.includes(slug)) continue;
        const skillEntity = await this.skillRepository.findOneBy({ slug });
        if (!skillEntity) continue;
        await manager.save(CharacterSkillEntity, {
          character_id: charId,
          skill_id: skillEntity.id,
          expertise: true,
        });
      }

      // character_proficiencies
      const raceProfSlugs = choices.raceProficiencyChoices ?? [];
      const bgProfSlugs = choices.backgroundProficiencyChoices ?? [];
      for (const slug of raceProfSlugs) {
        const profEntity = await this.proficiencyRepository.findOneBy({ slug });
        if (!profEntity) continue;
        await manager.save(CharacterProficiencyEntity, {
          character_id: charId,
          proficiency_id: profEntity.id,
          source: CharacterProficiencySourceEnum.Race,
        });
      }
      for (const slug of bgProfSlugs) {
        const profEntity = await this.proficiencyRepository.findOneBy({ slug });
        if (!profEntity) continue;
        await manager.save(CharacterProficiencyEntity, {
          character_id: charId,
          proficiency_id: profEntity.id,
          source: CharacterProficiencySourceEnum.Background,
        });
      }

      // character_spells
      const cantripSlugs = choices.classCantrips ?? [];
      const preparedSlugs = choices.classPreparedSpells ?? [];
      const spellbookSlugs = choices.classSpellbook ?? [];
      const raceSpellSlugs = choices.raceSpellChoices ?? [];

      for (const slug of cantripSlugs) {
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Known,
          always_prepared: true,
        });
      }
      for (const slug of preparedSlugs) {
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Prepared,
          always_prepared: false,
        });
      }
      for (const slug of spellbookSlugs) {
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Spellbook,
          always_prepared: false,
        });
      }
      for (const slug of raceSpellSlugs) {
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Race,
          status: SpellStatusEnum.Known,
          always_prepared: true,
        });
      }

      // character_state
      const conScore = choices.abilityScores?.constitution ?? 10;
      const conBonus =
        bgBonuses.find((b) => b.abilityScoreIndex === 'con')?.bonus ?? 0;
      const conMod = Math.floor((conScore + conBonus - 10) / 2);
      const startHp = classEntity.hit_die + conMod;
      const gp =
        (choices.classStartingGold as { amount?: number } | undefined)
          ?.amount ?? 0;

      await manager.save(CharacterStateEntity, {
        character_id: charId,
        current_hp: startHp,
        gp,
      });

      // character_origin
      await manager.save(CharacterOriginEntity, {
        character_id: charId,
        race_id: raceEntity.id,
        subrace_id: subraceEntity?.id ?? undefined,
        background_id: backgroundEntity.id,
        alignment_id: alignmentEntity?.id ?? undefined,
        personality: choices.personality ?? {},
        species_size: choices.speciesSize,
        species_spellcasting_ability: choices.speciesSpellcastingAbility,
        age: choices.age,
        height: choices.height,
        weight: choices.weight,
        ability_score_method: choices.abilityScoreMethod,
        race_trait_choices: choices.raceTraitChoices ?? [],
        race_feat_choice: choices.raceFeatChoiceIndex,
        divine_order: choices.divineOrder,
        primal_order: choices.primalOrder,
        fighting_style_index: choices.fightingStyleIndex,
        class_equipment_choices: choices.classEquipmentChoices ?? [],
        background_equipment_choices: choices.backgroundEquipmentChoices ?? [],
        class_starting_gold: choices.classStartingGold ?? undefined,
        eldritch_invocations: choices.eldritchInvocations ?? [],
        eldritch_invocation_sub_choices:
          choices.eldritchInvocationSubChoices ?? undefined,
        weapon_mastery_choices: choices.weaponMasteryChoices ?? [],
        class_language_choices: choices.classLanguageChoices ?? [],
        class_tool_proficiency: choices.classToolProficiency,
      });

      return saved;
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterEntity> {
    const character = await this.getById(userId, id);
    if (input.name !== undefined) {
      character.name = input.name.trim();
    }
    return this.characterRepository.save(character);
  }

  async remove(userId: string, id: string): Promise<void> {
    const character = await this.getById(userId, id);
    await this.characterRepository.remove(character);
  }
}
