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
  ClassEntity,
  SubclassEntity,
  CharacterEquipmentEntity,
  EquipmentEntity,
} from "src/entities";
import { EquipmentSourceEnum } from "src/entities/enums";
import { CharactersService } from "../../characters/services/characters.service";
import { CharacterSheetService } from "../../characters/services/character-sheet.service";
import {
  SeedCharacterDto,
  SupportedClassSlug,
} from "../dto/seed-character.dto";

export interface SeedCharacterResult {
  id: string;
  name: string;
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

  async seed(dto: SeedCharacterDto): Promise<SeedCharacterResult> {
    const classEntity = await this.resolveClass(dto.classSlug);
    await this.resolveSubclass(dto.subclassSlug, classEntity.id);
    const ownerUserId = await this.resolveOwner(dto.ownerUserId);
    const abilityScores = this.buildAbilityScores(dto);
    const name = dto.name ?? `${dto.classSlug}-L${dto.level}-e2e`;

    await this.ensureNameUnique(ownerUserId, name);

    const character = await this.createLevel1Character({
      ownerUserId,
      name,
      weaponMasteryChoices: dto.weaponMasteryChoices,
      fightingStyleSlug: dto.fightingStyleSlug,
      classSlug: dto.classSlug,
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

    if (dto.level > 1) {


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
      sheetSummary: summary,
    };
  }

  private async resolveClass(slug: SupportedClassSlug): Promise<ClassEntity> {
    const entity = await this.classRepo.findOneBy({ slug });
    if (!entity) {
      throw new BadRequestException({
        code: "INVALID_CLASS",
        field: "classSlug",
        message: `Classe "${slug}" não encontrada em comp_sources. Rode /admin/seed-all antes.`,
      });
    }
    return entity;
  }

  private async resolveSubclass(
    slug: string,
    classId: string,
  ): Promise<SubclassEntity | null> {
    const entity = await this.subclassRepo.findOneBy({ slug });
    if (!entity) {
      throw new BadRequestException({
        code: "INVALID_SUBCLASS",
        field: "subclassSlug",
        message: `Subclasse "${slug}" não encontrada.`,
      });
    }
    if (entity.class_id !== classId) {
      throw new BadRequestException({
        code: "INVALID_SUBCLASS",
        field: "subclassSlug",
        message: `Subclasse "${slug}" não pertence à classe informada.`,
      });
    }
    return entity;
  }

  private async resolveOwner(explicitId: string | undefined): Promise<string> {
    if (explicitId) {
      const user = await this.userRepo.findOneBy({ id: explicitId });
      if (!user) {
        throw new NotFoundException({
          code: "OWNER_USER_NOT_FOUND",
          field: "ownerUserId",
          message: `Usuário ${explicitId} não encontrado.`,
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
    const array = dto.abilityArray ?? this.allocateStandardArray(dto.classSlug);
    return {
      str: array[0],
      dex: array[1],
      con: array[2],
      int: array[3],
      wis: array[4],
      cha: array[5],
    };
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
    abilityScores: Record<string, number>;
    weaponMasteryChoices?: string[];
    fightingStyleSlug?: string;
  }): Promise<CharacterEntity> {







    const spellDefaults = CLASS_SPELL_DEFAULTS[params.classSlug];
    const data: Record<string, unknown> = {
      sourceCode: "XPHB",
      classSlug: params.classSlug,
      raceSlug: "human",
      backgroundSlug: "acolyte",
      abilityScores: params.abilityScores,
      abilityScoreMethod: "standard-array",
      skills: [],
      classEquipmentChoices: ["A"],
      backgroundEquipmentChoices: ["A"],


      ...(spellDefaults.cantrips
        ? { classCantrips: spellDefaults.cantrips }
        : {}),
      ...(spellDefaults.preparedSpells
        ? { classPreparedSpells: spellDefaults.preparedSpells }
        : {}),
      ...(spellDefaults.spellbook
        ? { classSpellbook: spellDefaults.spellbook }
        : {}),

      ...(params.weaponMasteryChoices?.length
        ? { weaponMasteryChoices: params.weaponMasteryChoices }
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
