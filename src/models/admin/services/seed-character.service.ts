import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UserEntity,
  CharacterEntity,
  CharacterClassEntity,
  ClassEntity,
  SubclassEntity,
  CharacterSpellEntity,
  CharacterStateEntity,
  CharacterEquipmentEntity,
  EquipmentEntity,
  SpellClassEntity,
  SpellEntity,
} from "src/entities";
import {
  EquipmentSourceEnum,
  SpellSourceEnum,
  SpellStatusEnum,
} from "src/entities/enums";
import { CharactersService } from "../../characters/services/characters.service";
import { CharacterSheetService } from "../../characters/services/character-sheet.service";
import {
  SeedCharacterDto,
  SupportedClassSlug,
  SupportedSpellLoadout,
} from "../dto/seed-character.dto";
import { getAbilityModifier } from "src/shared/srd-utils";
import { isSpellAutomationReady } from "src/models/game-engine/services/spell-automation-catalog";

export interface SeedCharacterResult {
  id: string;
  name: string;
  subclassSlug: string;
  sheetSummary: {
    level: number;
    hpMax: number;
    armorClass: number;
    proficiencyBonus: number;
    spellSlots?: number[];
  };
}


const PRIMARY_ABILITY_INDEX: Record<SupportedClassSlug, number> = {
  barbarian: 0,
  bard: 5,
  cleric: 4,
  druid: 4,
  fighter: 0,
  monk: 1,
  paladin: 0,
  ranger: 1,
  rogue: 1,
  sorcerer: 5,
  warlock: 5,
  wizard: 3,
};

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const E2E_DEFAULT_USER_EMAIL = "e2e-harness@diad.local";

const SPELL_LAB_SPELLCASTING_ABILITY_INDEX: Partial<
  Record<SupportedClassSlug, number>
> = {
  bard: 5,
  cleric: 4,
  druid: 4,
  paladin: 5,
  ranger: 4,
  sorcerer: 5,
  warlock: 5,
  wizard: 3,
};

interface SeedCharacterOptions {
  authenticatedUserId?: string;
}

interface ClassSpellDefaults {
  cantrips?: string[];
  preparedSpells?: string[];
  spellbook?: string[];
}

const CLASS_SPELL_DEFAULTS: Record<SupportedClassSlug, ClassSpellDefaults> = {
  barbarian: {},
  bard: {
    cantrips: ["vicious-mockery", "light"],
    preparedSpells: ["healing-word", "faerie-fire", "charm-person", "sleep"],
  },
  cleric: {
    cantrips: ["sacred-flame", "guidance", "light"],

    preparedSpells: [
      "cure-wounds",
      "bless",
      "healing-word",
      "guiding-bolt",
      "spirit-guardians",
    ],
  },
  druid: {
    cantrips: ["druidcraft", "produce-flame"],

    preparedSpells: [
      "cure-wounds",
      "entangle",
      "healing-word",
      "thunderwave",
      "spike-growth",
      "sleet-storm",
      "wall-of-fire",
    ],
  },
  fighter: {},
  monk: {},
  paladin: {
    preparedSpells: ["bless", "cure-wounds"],
  },
  ranger: {

    preparedSpells: ["hunters-mark", "cure-wounds", "spike-growth"],
  },
  rogue: {},
  sorcerer: {




    cantrips: [
      "fire-bolt",
      "ray-of-frost",
      "light",
      "prestidigitation",
      "mage-hand",
    ],
    preparedSpells: [
      "magic-missile",
      "shield",
      "burning-hands",
      "chromatic-orb",
    ],
  },
  warlock: {
    cantrips: ["eldritch-blast", "mage-hand"],
    preparedSpells: ["hex", "armor-of-agathys"],
  },
  wizard: {





    cantrips: [
      "fire-bolt",
      "ray-of-frost",
      "mage-hand",
      "prestidigitation",
      "minor-illusion",
      "light",
    ],
    spellbook: [
      "mage-armor",
      "magic-missile",
      "shield",
      "sleep",
      "detect-magic",
      "feather-fall",
      "witch-bolt",
      "burning-hands",
      "grease",
      "web",
      "cloud-of-daggers",
      "sleet-storm",
      "wall-of-fire",
    ],
    preparedSpells: [
      "mage-armor",
      "magic-missile",
      "shield",
      "sleep",
      "grease",
      "web",
      "cloud-of-daggers",
      "sleet-storm",
      "wall-of-fire",
    ],
  },
};

@Injectable()
export class SeedCharacterService {
  private readonly logger = new Logger(SeedCharacterService.name);

  constructor(
    private readonly charactersService: CharactersService,
    private readonly characterSheetService: CharacterSheetService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepo: Repository<ClassEntity>,
    @InjectRepository(SubclassEntity)
    private readonly subclassRepo: Repository<SubclassEntity>,
    @InjectRepository(EquipmentEntity)
    private readonly equipmentRepo: Repository<EquipmentEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly characterEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly characterClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly characterStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly characterSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(SpellClassEntity)
    private readonly spellClassRepo: Repository<SpellClassEntity>,
  ) {}


  private async addExtraEquipment(
    characterId: string,
    slugs: string[],
  ): Promise<void> {
    for (const slug of slugs) {
      const eq = await this.equipmentRepo.findOne({ where: { slug } });
      if (!eq) {
        this.logger.warn(
          `addExtraEquipment: slug "${slug}" não existe em equipments. Pulando.`,
        );
        continue;
      }
      await this.characterEquipRepo.save({
        character_id: characterId,
        equipment_id: eq.id,
        quantity: 1,
        equipped: false,
        source: EquipmentSourceEnum.Bought,
      });
    }
  }


  private async equipHandBySlug(
    characterId: string,
    equipmentSlug: string,
    hand: "main" | "off",
  ): Promise<void> {
    const eq = await this.equipmentRepo.findOne({
      where: { slug: equipmentSlug },
    });
    if (!eq) {
      this.logger.warn(
        `equipHandBySlug: slug "${equipmentSlug}" não existe em equipments. Pulando.`,
      );
      return;
    }
    const ce = await this.characterEquipRepo.findOne({
      where: { character_id: characterId, equipment_id: eq.id },
    });
    if (!ce) {
      this.logger.warn(
        `equipHandBySlug: char ${characterId} não tem equipment ${equipmentSlug} no inventário (adicionar via starter pack ou additionalEquipmentSlugs primeiro).`,
      );
      return;
    }


    const targetCol = hand === "main" ? "mainHand" : "offHand";
    const others = await this.characterEquipRepo.find({
      where: { character_id: characterId },
    });
    for (const other of others) {
      if (other.id === ce.id) continue;
      if (other[targetCol]) {
        other[targetCol] = false;
        await this.characterEquipRepo.save(other);
      }
    }


    const props = (eq.properties ?? []) as Array<{
      slug?: string;
      index?: string;
      name?: string;
    }>;
    const isTwoHanded =
      Array.isArray(props) &&
      props.some(
        (p) => (p.slug ?? p.index ?? "").toLowerCase() === "two-handed",
      );

    ce.mainHand = hand === "main";
    ce.offHand = hand === "off" || (hand === "main" && isTwoHanded);
    await this.characterEquipRepo.save(ce);
  }


  private async defaultEquipFirstWeapon(
    characterId: string,
    weaponMasteryChoices?: string[],
  ): Promise<void> {
    const items = await this.characterEquipRepo.find({
      where: { character_id: characterId },
    });
    const weapons = items.filter((i) => !!i.equipment.damage);
    if (weapons.length === 0) return;





    const masterySet = new Set(weaponMasteryChoices ?? []);
    let pick = weapons.find((w) => masterySet.has(w.equipment.slug));
    if (!pick) {
      const priority = ["longsword", "shortsword", "mace", "club", "dagger"];
      pick = weapons.find((w) => priority.includes(w.equipment.slug));
    }
    if (!pick) pick = weapons[0];

    const props = (pick.equipment.properties ?? []) as Array<{
      slug?: string;
      index?: string;
      name?: string;
    }>;
    const isTwoHanded =
      Array.isArray(props) &&
      props.some(
        (p) => (p.slug ?? p.index ?? "").toLowerCase() === "two-handed",
      );

    pick.mainHand = true;
    pick.offHand = isTwoHanded;
    await this.characterEquipRepo.save(pick);
  }

  async seed(
    dto: SeedCharacterDto,
    options: SeedCharacterOptions = {},
  ): Promise<SeedCharacterResult> {
    const isSpellLab = dto.seedMode === "spell-lab";
    this.validateSeedMode(dto);

    const classEntity = await this.resolveClass(dto.classSlug, dto.edition);
    const subclassEntity = await this.resolveSubclass(
      dto.subclassSlug,
      classEntity.id,
      dto.classSlug,
      dto.edition,
    );
    const ownerUserId = await this.resolveOwner(
      dto.ownerUserId,
      isSpellLab ? options.authenticatedUserId : undefined,
    );
    const abilityScores = this.buildAbilityScores(dto);
    const name =
      dto.name ??
      (isSpellLab
        ? `SpellLab-${dto.classSlug}-L${dto.level}-${Date.now()}`
        : `${dto.classSlug}-L${dto.level}-e2e`);

    await this.ensureNameUnique(ownerUserId, name);

    const character = await this.createLevel1Character({
      ownerUserId,
      name,
      weaponMasteryChoices: dto.weaponMasteryChoices,
      raceTraitChoices: dto.raceTraitChoices,
      fightingStyleSlug: dto.fightingStyleSlug,
      classSlug: dto.classSlug,
      resolvedClassSlug: classEntity.slug,
      classEquipmentChoices: this.defaultEquipmentChoices(
        classEntity.starting_equipment_options,
      ),
      edition: dto.edition,
      raceSlug: dto.raceSlug,
      subraceSlug: dto.subraceSlug,
      backgroundSlug: dto.backgroundSlug,
      backgroundAbilityBonuses: dto.backgroundAbilityBonuses,
      raceAbilityBonuses: dto.raceAbilityBonuses,
      subclassSlug: subclassEntity.slug,
      abilityScores,
    });


    if (dto.additionalEquipmentSlugs?.length) {
      await this.addExtraEquipment(character.id, dto.additionalEquipmentSlugs);
    }






    if (!dto.mainHandSlug) {
      await this.defaultEquipFirstWeapon(
        character.id,
        dto.weaponMasteryChoices,
      );
    }




    if (dto.mainHandSlug) {
      await this.equipHandBySlug(character.id, dto.mainHandSlug, "main");
    }
    if (dto.offHandSlug) {
      await this.equipHandBySlug(character.id, dto.offHandSlug, "off");
    }

    if (isSpellLab) {
      await this.configureSpellLabCharacter({
        characterId: character.id,
        classEntity,
        subclassEntity,
        dto,
        abilityScores,
      });
    } else if (dto.level > 1) {


      throw new NotImplementedException({
        code: "LEVEL_UP_NOT_YET_IMPLEMENTED",
        message: `Seed L${dto.level} ainda não implementado. PC L1 criado (id=${character.id}); próxima iteração da spec 012 adiciona level-up determinístico.`,
        characterId: character.id,
        level: 1,
      });
    }

    const summary = await this.buildSheetSummary(ownerUserId, character.id);

    this.logger.log(
      `Seed OK: ${name} (${dto.classSlug}, L${dto.level}, owner=${ownerUserId})`,
    );

    return {
      id: character.id,
      name: character.name,
      subclassSlug: subclassEntity.slug,
      sheetSummary: summary,
    };
  }

  private async configureSpellLabCharacter(params: {
    characterId: string;
    classEntity: ClassEntity;
    subclassEntity: SubclassEntity;
    dto: SeedCharacterDto;
    abilityScores: Record<string, number>;
  }): Promise<void> {
    const { characterId, classEntity, subclassEntity, dto, abilityScores } =
      params;

    const characterClass = await this.characterClassRepo.findOne({
      where: { character_id: characterId, class_id: classEntity.id },
    });
    if (!characterClass) {
      throw new NotFoundException({
        code: "SPELL_LAB_CLASS_ROW_NOT_FOUND",
        message: `Classe ${classEntity.slug} nao encontrada no personagem ${characterId}.`,
      });
    }

    characterClass.class_level = dto.level;
    characterClass.subclass_id = subclassEntity.id;
    await this.characterClassRepo.save(characterClass);

    await this.replaceSpellLabSpells(
      characterId,
      classEntity,
      dto.classSlug,
      dto.spellLoadout ?? "all-class-spells",
    );
    await this.markSpellLabCharacter(
      characterId,
      dto.spellLoadout ?? "all-class-spells",
    );
    await this.configureSpellLabState(
      characterId,
      classEntity.hit_die,
      dto.level,
      abilityScores,
    );
  }

  private async replaceSpellLabSpells(
    characterId: string,
    classEntity: ClassEntity,
    classSlug: SupportedClassSlug,
    spellLoadout: SupportedSpellLoadout,
  ): Promise<void> {
    const links = await this.spellClassRepo.find({
      where: { class_id: classEntity.id },
      relations: ["spell"],
    });

    const bySpellId = new Map(
      links
        .map((link) => link.spell)
        .filter((spell): spell is SpellEntity => !!spell)
        .filter(
          (spell) =>
            spellLoadout === "all-class-spells" ||
            isSpellAutomationReady(spell.slug),
        )
        .map((spell) => [spell.id, spell]),
    );

    const spells = [...bySpellId.values()].sort(
      (a, b) => a.level - b.level || a.name.localeCompare(b.name),
    );

    if (spells.length === 0) {
      throw new BadRequestException({
        code: "SPELL_LAB_NO_SPELLS_FOUND",
        field: "spellLoadout",
        message: `Nenhuma magia encontrada para ${classEntity.slug} com loadout ${spellLoadout}.`,
      });
    }

    await this.characterSpellRepo.delete({ character_id: characterId });
    await this.characterSpellRepo.save(
      spells.map((spell) => ({
        character_id: characterId,
        spell_id: spell.id,
        source: SpellSourceEnum.Class,
        status: this.getSpellLabStatus(classSlug, spell.level),
        always_prepared: true,
      })),
    );
  }

  private async markSpellLabCharacter(
    characterId: string,
    spellLoadout: SupportedSpellLoadout,
  ): Promise<void> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) return;
    character.data = {
      ...(character.data ?? {}),
      seedMode: "spell-lab",
      devMode: "spell-lab",
      spellLoadout,
      ignoresPreparationLimit: true,
    };
    await this.characterRepo.save(character);
  }

  private getSpellLabStatus(
    classSlug: SupportedClassSlug,
    spellLevel: number,
  ): SpellStatusEnum {
    if (spellLevel === 0) return SpellStatusEnum.Known;
    if (classSlug === "wizard") return SpellStatusEnum.Spellbook;
    return SpellStatusEnum.Prepared;
  }

  private async configureSpellLabState(
    characterId: string,
    hitDie: number,
    level: number,
    abilityScores: Record<string, number>,
  ): Promise<void> {
    const conMod = getAbilityModifier(abilityScores.con ?? 10);
    const levelOneHp = hitDie + conMod;
    const fixedHpPerLevel = Math.floor(hitDie / 2) + 1 + conMod;
    const maxHp = levelOneHp + (level - 1) * fixedHpPerLevel;
    const maxHpBonus = Math.max(0, maxHp - levelOneHp);

    const state = await this.characterStateRepo.findOne({
      where: { character_id: characterId },
    });
    await this.characterStateRepo.save({
      ...(state ?? {}),
      character_id: characterId,
      current_hp: maxHp,
      max_hp_bonus: maxHpBonus,
      spell_slots_used: {},
      hit_dice_used: {},
    });
  }

  private validateSeedMode(dto: SeedCharacterDto): void {
    const isSpellLab = dto.seedMode === "spell-lab";

    if (!isSpellLab && dto.spellLoadout) {
      throw new BadRequestException({
        code: "SPELL_LOADOUT_REQUIRES_SPELL_LAB",
        field: "spellLoadout",
        message: "spellLoadout so pode ser usado com seedMode='spell-lab'.",
      });
    }

    if (!isSpellLab) return;

    if (dto.edition !== "XPHB") {
      throw new BadRequestException({
        code: "SPELL_LAB_REQUIRES_XPHB",
        field: "edition",
        message: "O modo spell-lab usa apenas regras XPHB.",
      });
    }

    if (dto.level !== 20) {
      throw new BadRequestException({
        code: "SPELL_LAB_REQUIRES_LEVEL_20",
        field: "level",
        message: "O modo spell-lab cria apenas personagens L20.",
      });
    }

    if (!SPELL_LAB_SPELLCASTING_ABILITY_INDEX[dto.classSlug]) {
      throw new BadRequestException({
        code: "SPELL_LAB_UNSUPPORTED_CLASS",
        field: "classSlug",
        message: `A classe "${dto.classSlug}" nao tem spell lab L20 no v1.`,
      });
    }
  }

  private async resolveClass(
    slug: SupportedClassSlug,
    edition: "PHB" | "XPHB",
  ): Promise<ClassEntity> {
    const qualifiedSlug = edition === "PHB" ? `${slug}-phb` : slug;
    const entity = await this.classRepo.findOneBy({ slug: qualifiedSlug });
    if (!entity) {
      throw new BadRequestException({
        code: "INVALID_CLASS",
        field: "classSlug",
        message: `Classe "${qualifiedSlug}" não encontrada em comp_sources. Rode /admin/seed-all antes.`,
      });
    }
    return entity;
  }

  private async resolveSubclass(
    slug: string,
    classId: string,
    classSlug: SupportedClassSlug,
    edition: "PHB" | "XPHB",
  ): Promise<SubclassEntity> {
    const candidates = this.subclassCandidates(slug, classSlug, edition);
    let entity: SubclassEntity | null = null;
    for (const candidate of candidates) {
      const found = await this.subclassRepo.findOneBy({ slug: candidate });
      if (found?.class_id === classId) {
        entity = found;
        break;
      }
    }
    if (!entity) {
      throw new BadRequestException({
        code: "INVALID_SUBCLASS",
        field: "subclassSlug",
        message: `Subclasse "${slug}" não encontrada para ${classSlug} (${edition}).`,
      });
    }
    return entity;
  }

  private subclassCandidates(
    slug: string,
    classSlug: SupportedClassSlug,
    edition: "PHB" | "XPHB",
  ): string[] {
    const specialAliases: Record<string, string> = {
      "XPHB:wizard:evocation": "wizard-evoker",
      "PHB:wizard:evocation": "wizard-evocation-phb",
      "PHB:sorcerer:wild-magic": "sorcerer-wild-phb",
    };
    const special = specialAliases[`${edition}:${classSlug}:${slug}`];
    const prefixed = slug.startsWith(`${classSlug}-`)
      ? slug
      : `${classSlug}-${slug}`;
    const qualified =
      edition === "PHB" && !prefixed.endsWith("-phb")
        ? `${prefixed}-phb`
        : prefixed;

    return [...new Set([special, qualified, slug].filter(Boolean))] as string[];
  }

  private async resolveOwner(
    explicitId: string | undefined,
    authenticatedUserId?: string,
  ): Promise<string> {
    const requestedUserId = explicitId ?? authenticatedUserId;
    if (requestedUserId) {
      const user = await this.userRepo.findOneBy({ id: requestedUserId });
      if (!user) {
        throw new NotFoundException({
          code: "OWNER_USER_NOT_FOUND",
          field: "ownerUserId",
          message: `Usuário ${requestedUserId} não encontrado.`,
        });
      }
      return user.id;
    }

    const e2eUser = await this.userRepo.findOneBy({
      email: E2E_DEFAULT_USER_EMAIL,
    });
    if (!e2eUser) {
      throw new NotFoundException({
        code: "E2E_USER_NOT_SEEDED",
        message: `Usuário E2E (${E2E_DEFAULT_USER_EMAIL}) não existe. Rode a migration SeedE2EHarnessUser com E2E_HARNESS_PASSWORD definido, ou passe ownerUserId explícito.`,
      });
    }
    return e2eUser.id;
  }

  private buildAbilityScores(dto: SeedCharacterDto): Record<string, number> {
    const array =
      dto.abilityArray ??
      (dto.seedMode === "spell-lab"
        ? this.allocateSpellLabArray(dto.classSlug)
        : this.allocateStandardArray(dto.classSlug));
    return {
      str: array[0],
      dex: array[1],
      con: array[2],
      int: array[3],
      wis: array[4],
      cha: array[5],
    };
  }


  private allocateSpellLabArray(classSlug: SupportedClassSlug): number[] {
    const spellAbilityIdx = SPELL_LAB_SPELLCASTING_ABILITY_INDEX[classSlug];
    if (spellAbilityIdx == null) {
      return this.allocateStandardArray(classSlug);
    }

    const result = [10, 14, 16, 10, 10, 10];
    result[spellAbilityIdx] = 20;
    return result;
  }


  private allocateStandardArray(classSlug: SupportedClassSlug): number[] {
    const result = [10, 10, 10, 10, 10, 10];
    const primaryIdx = PRIMARY_ABILITY_INDEX[classSlug];
    const conIdx = 2;

    result[primaryIdx] = STANDARD_ARRAY[0];
    if (primaryIdx !== conIdx) {
      result[conIdx] = STANDARD_ARRAY[1];
    }


    const remainingScores =
      primaryIdx === conIdx ? [14, 13, 12, 10, 8] : [13, 12, 10, 8];
    let scoreIdx = 0;
    for (let i = 0; i < 6; i++) {
      if (i === primaryIdx || i === conIdx) continue;
      if (scoreIdx < remainingScores.length) {
        result[i] = remainingScores[scoreIdx++];
      }
    }
    return result;
  }

  private async ensureNameUnique(
    ownerUserId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.characterRepo.findOne({
      where: { userId: ownerUserId, name },
    });
    if (existing) {
      throw new ConflictException({
        code: "CHARACTER_NAME_EXISTS",
        message: `Personagem "${name}" já existe para este usuário. Use nome diferente ou delete o anterior.`,
      });
    }
  }

  private async createLevel1Character(params: {
    ownerUserId: string;
    name: string;
    classSlug: SupportedClassSlug;
    resolvedClassSlug: string;
    classEquipmentChoices: string[];
    edition: "PHB" | "XPHB";
    raceSlug?: string;
    subraceSlug?: string;
    backgroundSlug?: string;
    backgroundAbilityBonuses?: Array<{
      abilityScoreSlug: string;
      bonus: number;
    }>;
    raceAbilityBonuses?: Array<{
      abilityScoreSlug: string;
      bonus: number;
    }>;
    subclassSlug: string;
    abilityScores: Record<string, number>;
    weaponMasteryChoices?: string[];
    raceTraitChoices?: string[];
    fightingStyleSlug?: string;
  }): Promise<CharacterEntity> {







    const spellDefaults = CLASS_SPELL_DEFAULTS[params.classSlug];
    const qualifySpellSlugs = (slugs: string[] | undefined) =>
      params.edition === "PHB"
        ? slugs?.map((slug) => `${slug}-phb`)
        : slugs;
    const raceSlug =
      params.raceSlug ??
      (params.edition === "PHB" ? "human-phb" : "human");
    const backgroundSlug =
      params.backgroundSlug ??
      (params.edition === "PHB" ? "acolyte-phb" : "acolyte");
    const data: Record<string, unknown> = {
      sourceCode: params.edition,
      classSlug: params.resolvedClassSlug,
      subclassSlug: params.subclassSlug,
      raceSlug,
      ...(params.subraceSlug ? { subraceSlug: params.subraceSlug } : {}),
      backgroundSlug,
      backgroundAbilityBonuses: params.backgroundAbilityBonuses,
      raceAbilityBonuses: params.raceAbilityBonuses,
      abilityScores: params.abilityScores,
      abilityScoreMethod: "standard-array",
      skills: [],
      classEquipmentChoices:
        params.classEquipmentChoices.length > 0
          ? params.classEquipmentChoices
          : ["A"],
      backgroundEquipmentChoices: ["A"],


      ...(spellDefaults.cantrips
        ? { classCantrips: qualifySpellSlugs(spellDefaults.cantrips) }
        : {}),
      ...(spellDefaults.preparedSpells
        ? {
            classPreparedSpells: qualifySpellSlugs(
              spellDefaults.preparedSpells,
            ),
          }
        : {}),
      ...(spellDefaults.spellbook
        ? { classSpellbook: qualifySpellSlugs(spellDefaults.spellbook) }
        : {}),

      ...(params.weaponMasteryChoices?.length
        ? { weaponMasteryChoices: params.weaponMasteryChoices }
        : {}),

      ...(params.raceTraitChoices?.length
        ? { raceTraitChoices: params.raceTraitChoices }
        : {}),

      ...(params.fightingStyleSlug
        ? { fightingStyleSlug: params.fightingStyleSlug }
        : {}),
    };

    return this.charactersService.create({
      userId: params.ownerUserId,
      name: params.name,
      data,
    });
  }

  private defaultEquipmentChoices(
    raw:
      | {
          defaultData?: Array<Record<string, unknown>>;
        }
      | Record<string, unknown>
      | null
      | undefined,
  ): string[] {
    const groups = (
      raw as { defaultData?: Array<Record<string, unknown>> } | undefined
    )?.defaultData;
    if (!Array.isArray(groups)) return [];
    return groups
      .map((group) =>
        Object.keys(group).find((key) => /^[A-Za-z]$/.test(key)),
      )
      .filter((key): key is string => !!key)
      .map((key) => key.toUpperCase());
  }

  private async buildSheetSummary(
    userId: string,
    characterId: string,
  ): Promise<SeedCharacterResult["sheetSummary"]> {
    const sheet = (await this.characterSheetService.computeSheet(
      userId,
      characterId,
    )) as {
      totalLevel?: number;
      maxHp?: number;
      armorClass?: number;
      proficiencyBonus?: number;
      spellSlots?: unknown;
    };
    const level = sheet.totalLevel ?? 1;
    const hpMax = sheet.maxHp ?? 0;
    const armorClass = sheet.armorClass ?? 0;
    const proficiencyBonus = sheet.proficiencyBonus ?? 2;
    const slotsArray = this.normalizeSpellSlots(sheet.spellSlots);

    return {
      level,
      hpMax,
      armorClass,
      proficiencyBonus,
      ...(slotsArray ? { spellSlots: slotsArray } : {}),
    };
  }

  private normalizeSpellSlots(raw: unknown): number[] | undefined {
    const slots = new Array(9).fill(0) as number[];

    if (Array.isArray(raw)) {

      for (const entry of raw) {
        if (typeof entry === "number") {

          const idx = raw.indexOf(entry);
          if (idx >= 0 && idx < 9) slots[idx] = entry;
        } else if (entry && typeof entry === "object") {
          const level = (entry as { level?: number }).level;
          const total = (entry as { total?: number }).total;
          if (
            typeof level === "number" &&
            level >= 1 &&
            level <= 9 &&
            typeof total === "number"
          ) {
            slots[level - 1] = total;
          }
        }
      }
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      for (let i = 1; i <= 9; i++) {
        const val = obj[i] ?? obj[String(i)] ?? obj[`level${i}`];
        if (typeof val === "number") slots[i - 1] = val;
      }
    }


    return slots.some((v) => v > 0) ? slots : undefined;
  }
}
