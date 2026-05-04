import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterSpellEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  RestEventTemplateEntity,
  SpellEntity,
  SpellClassEntity,
} from "src/entities";
import { RestEventTriggered } from "src/entities/rest-session.entity";
import { SpellSourceEnum, SpellStatusEnum } from "src/entities/enums";
import { GameClockService } from "src/models/world/services/game-clock.service";
import {
  CASTER_CLASS_TYPE,
  SPELLCASTING_ABILITY,
  CASTER_SLOT_TYPE,
  FULL_CASTER_SLOTS,
  WARLOCK_SLOTS,
  CasterClassType,
  getCasterClassType,
  getSpellcastingAbility,
  getCasterSlotType,
  normalizeClassSlug,
} from "src/shared/srd-constants";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  ensureCharacterOwnership,
  getCharacterState,
} from "src/shared/character-guard";
import {
  type EditionRules,
  getCasterTypeOverride,
  getPreparedFormula,
} from "src/shared/edition-rules";
import { CLASS_FEATURE_CATALOG } from "src/models/game-engine/services/action-resolvers/class-feature-catalog";
import { ReputationDecayService } from "src/models/world/services/reputation-decay.service";

type CasterType = CasterClassType;

// ---- DTOs ----

export interface PreparedSpellsDto {
  spells: string[]; // spell slugs
}

export interface SpellSlotUpdateDto {
  level: number;
  used: number;
}

export interface RestDto {
  type: "short" | "long";
  hitDiceToSpend?: Array<{ classSlug: string; count: number }>;
  preparedSpells?: string[]; // full replacement for 'all' mode (Cleric/Druid/Wizard)
  spellSwap?: { removeSlug: string; addSlug: string }; // single swap for 'one' mode (Paladin/Ranger)
}

export interface PreparedSpellsResult {
  prepared: Array<{ slug: string; name: string; level: number }>;
  maxPrepared: number;
  casterType: string;
}

export interface SpellSlotUpdateResult {
  level: number;
  total: number;
  used: number;
}

export interface RestResult {
  type: "short" | "long";
  hpRestored: number;
  currentHp: number;
  slotsRestored: boolean;
  hitDiceRecovered: number;
  deathSavesReset: boolean;
  summary: string[];
  restEvent?: { kind: RestEventTriggered } | null;
}

export interface AvailableSpellsResult {
  classSlug: string;
  casterType: string;
  maxPrepared: number;
  maxSpellLevel: number;
  /** 'all' = replace entire list (Cleric/Druid/Wizard), 'one' = swap 1 spell (Paladin/Ranger), 'none' = level-up only */
  prepChangeMode: "all" | "one" | "none";
  currentPrepared: Array<{
    slug: string;
    name: string;
    level: number;
    alwaysPrepared: boolean;
  }>;
  availableSpells: Array<{
    slug: string;
    name: string;
    level: number;
    school?: string;
  }>;
}

export interface LearnSpellDto {
  spellSlug: string;
}

export interface LearnSpellResult {
  slug: string;
  name: string;
  level: number;
  status: string;
  message: string;
}

export interface UnlearnSpellResult {
  slug: string;
  message: string;
}

export interface ManageableSpellsResult {
  classSlug: string;
  className: string;
  casterType: string;
  maxPrepared: number;
  maxSpellLevel: number;
  currentSpells: Array<{
    slug: string;
    name: string;
    level: number;
    status: string;
    alwaysPrepared: boolean;
    canRemove: boolean;
  }>;
  availableToLearn: Array<{
    slug: string;
    name: string;
    level: number;
    school?: string;
  }>;
}

@Injectable()
export class SpellService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly charSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterLevelUpEntity)
    private readonly charLevelUpRepo: Repository<CharacterLevelUpEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
    @InjectRepository(SpellClassEntity)
    private readonly spellClassRepo: Repository<SpellClassEntity>,
    @InjectRepository(RestEventTemplateEntity)
    private readonly restEventTplRepo: Repository<RestEventTemplateEntity>,
    private readonly dataSource: DataSource,
    private readonly reputationDecayService: ReputationDecayService,
    private readonly gameClockService: GameClockService,
  ) {}

  private async findActiveCampaignsForCharacter(
    characterId: string,
  ): Promise<string[]> {
    try {
      const rows: Array<{ campaign_id: string }> = await this.dataSource.query(
        `SELECT DISTINCT s.campaign_id
           FROM "game_sessions" s
          WHERE s.campaign_id IS NOT NULL
            AND s.status IN ('active','paused')
            AND s.character_ids @> jsonb_build_array($1::text)`,
        [characterId],
      );
      return rows.map((r) => r.campaign_id).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async advanceClockAfterRest(
    characterId: string,
    hours: number,
    trigger: "long_rest" | "short_rest",
  ): Promise<void> {
    const campaignIds = await this.findActiveCampaignsForCharacter(characterId);
    for (const campaignId of campaignIds) {
      try {
        await this.gameClockService.advanceTime(campaignId, {
          hours,
          trigger,
        });
      } catch {
        /* best-effort — clock advance falha não derruba o rest */
      }
    }
  }

  private async rollRestEvent(): Promise<RestEventTriggered | null> {
    try {
      const tpls = await this.restEventTplRepo.find();
      if (tpls.length === 0) return null;
      const total = tpls.reduce((s, t) => s + Math.max(0, t.weight), 0);
      if (total <= 0) return null;
      let r = Math.random() * total;
      for (const t of tpls) {
        r -= Math.max(0, t.weight);
        if (r <= 0) return t.kind;
      }
      return tpls[tpls.length - 1].kind;
    } catch {
      return null;
    }
  }

  // ---- Helpers ----

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterOwnership(this.characterRepo, userId, characterId);
  }

  private async getState(characterId: string): Promise<CharacterStateEntity> {
    return getCharacterState(this.stateRepo, characterId);
  }

  private getAbilityMod(
    charAbilities: CharacterAbilityScoreEntity[],
    abilitySlug: string,
  ): number {
    const ab = charAbilities.find((a) => a.ability_score.slug === abilitySlug);
    if (!ab) return 0;
    return getAbilityModifier(ab.base_score + ab.bonus);
  }

  private getMaxSpellLevel(charClasses: CharacterClassEntity[]): number {
    let fullCasterLevels = 0;
    let halfCasterLevels = 0;
    let warlockLevel = 0;

    for (const cc of charClasses) {
      const slotType = getCasterSlotType(cc.class.slug);
      if (!slotType) continue;
      if (slotType === "full") fullCasterLevels += cc.class_level;
      else if (slotType === "half") halfCasterLevels += cc.class_level;
      else if (slotType === "pact") warlockLevel = cc.class_level;
    }

    const effectiveCasterLevel =
      fullCasterLevels + Math.floor(halfCasterLevels / 2);
    let maxLevel = 0;

    if (effectiveCasterLevel > 0) {
      const slots = FULL_CASTER_SLOTS[Math.min(effectiveCasterLevel, 20)];
      maxLevel = slots?.length ?? 0;
    }

    if (warlockLevel > 0) {
      const pact = WARLOCK_SLOTS[warlockLevel - 1];
      if (pact && pact.level > maxLevel) {
        maxLevel = pact.level;
      }
    }

    return maxLevel;
  }

  private getSpellSlotTotals(
    charClasses: CharacterClassEntity[],
  ): Record<string, number> {
    let fullCasterLevels = 0;
    let halfCasterLevels = 0;
    let warlockLevel = 0;

    for (const cc of charClasses) {
      const slotType = getCasterSlotType(cc.class.slug);
      if (!slotType) continue;
      if (slotType === "full") fullCasterLevels += cc.class_level;
      else if (slotType === "half") halfCasterLevels += cc.class_level;
      else if (slotType === "pact") warlockLevel = cc.class_level;
    }

    const result: Record<string, number> = {};

    const effectiveCasterLevel =
      fullCasterLevels + Math.floor(halfCasterLevels / 2);
    if (effectiveCasterLevel > 0) {
      const slots = FULL_CASTER_SLOTS[Math.min(effectiveCasterLevel, 20)];
      if (slots) {
        for (let i = 0; i < slots.length; i++) {
          result[String(i + 1)] = slots[i];
        }
      }
    }

    if (warlockLevel > 0) {
      const pact = WARLOCK_SLOTS[warlockLevel - 1];
      if (pact) {
        result["pact"] = pact.slots;
      }
    }

    return result;
  }

  /**
   * Returns the maximum number of prepared spells for a given class.
   * - Cleric/Druid: class_level + WIS mod (min 1)
   * - Paladin: floor(class_level/2) + CHA mod (min 1)
   * - Wizard: wizard_level + INT mod (min 1)
   * - Known casters (Bard/Sorcerer/Ranger/Warlock): all known spells are always prepared
   */
  private computeMaxPrepared(
    classSlug: string,
    classLevel: number,
    charAbilities: CharacterAbilityScoreEntity[],
    editionRules?: EditionRules,
  ): number {
    const baseSlug = normalizeClassSlug(classSlug);
    // Check edition-specific caster type override (e.g., Ranger -> total_access in 2024)
    const casterTypeOverride = getCasterTypeOverride(baseSlug, editionRules) as
      | CasterType
      | undefined;
    const casterType = casterTypeOverride ?? getCasterClassType(classSlug);
    const scAbility = getSpellcastingAbility(classSlug);
    if (!casterType || !scAbility) return 0;

    const abilityMod = this.getAbilityMod(charAbilities, scAbility);

    switch (casterType) {
      case "total_access": {
        // Check edition-specific prepared formula
        const formula = getPreparedFormula(baseSlug, editionRules);
        if (formula === "halfLevel+mod") {
          return Math.max(1, Math.floor(classLevel / 2) + abilityMod);
        }
        // Default: level + mod (2024 Paladin, Cleric, Druid, 2024 Ranger)
        return Math.max(1, classLevel + abilityMod);
      }

      case "spellbook":
        // Wizard: INT mod + wizard level
        return Math.max(1, classLevel + abilityMod);

      case "known":
      case "pact":
        // Known casters: all known are always prepared, no limit
        return Infinity;

      default:
        return 0;
    }
  }

  // ---- PUT /characters/:id/prepared-spells ----

  async updatePreparedSpells(
    userId: string,
    characterId: string,
    dto: PreparedSpellsDto,
  ): Promise<PreparedSpellsResult> {
    const character = await this.ensureOwnership(userId, characterId);

    const [charClasses, charAbilities, charSpells] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
    ]);

    // Find primary caster class
    const casterClass = charClasses.find((cc) =>
      getCasterClassType(cc.class.slug),
    );
    if (!casterClass) {
      throw new BadRequestException("Personagem nao possui classe com magias.");
    }

    const classSlug = casterClass.class.slug;
    const casterType = getCasterClassType(classSlug)!;

    // Known-spell casters cannot change prepared spells outside of level up
    if (casterType === "known" || casterType === "pact") {
      throw new BadRequestException(
        "Esta classe so pode trocar magias ao subir de nivel.",
      );
    }

    const maxPrepared = this.computeMaxPrepared(
      classSlug,
      casterClass.class_level,
      charAbilities,
      character.source?.rules,
    );

    // Filter out cantrips from the request (cantrips are always known)
    const requestedSlugs = dto.spells.filter(Boolean);

    if (requestedSlugs.length > maxPrepared) {
      throw new BadRequestException(
        `Numero maximo de magias preparadas: ${maxPrepared}. Enviado: ${requestedSlugs.length}.`,
      );
    }

    // Resolve spell entities
    const requestedSpells =
      requestedSlugs.length > 0
        ? await this.spellRepo.find({ where: { slug: In(requestedSlugs) } })
        : [];

    if (requestedSpells.length !== requestedSlugs.length) {
      const found = new Set(requestedSpells.map((s) => s.slug));
      const missing = requestedSlugs.filter((s) => !found.has(s));
      throw new BadRequestException(
        `Magias nao encontradas: ${missing.join(", ")}`,
      );
    }

    // Validate: all spells must be level > 0 (cantrips handled separately)
    for (const spell of requestedSpells) {
      if (spell.level === 0) {
        throw new BadRequestException(
          `'${spell.name}' e um cantrip e nao precisa ser preparado.`,
        );
      }
    }

    // Validate max spell level
    const maxSpellLevel = this.getMaxSpellLevel(charClasses);
    for (const spell of requestedSpells) {
      if (spell.level > maxSpellLevel) {
        throw new BadRequestException(
          `'${spell.name}' e nivel ${spell.level}, mas o nivel maximo de slot disponivel e ${maxSpellLevel}.`,
        );
      }
    }

    // For total_access casters: validate spells belong to the class list
    if (casterType === "total_access") {
      const classSpellIds = await this.spellClassRepo.find({
        where: { class_id: casterClass.class_id },
      });
      const validSpellIds = new Set(classSpellIds.map((sc) => sc.spell_id));
      for (const spell of requestedSpells) {
        if (!validSpellIds.has(spell.id)) {
          throw new BadRequestException(
            `'${spell.name}' nao esta na lista de magias de ${casterClass.class.name}.`,
          );
        }
      }
    }

    // For spellbook casters: validate spells are in the character's spellbook
    if (casterType === "spellbook") {
      const spellbookSpellIds = new Set(
        charSpells
          .filter(
            (cs) =>
              cs.status === SpellStatusEnum.Spellbook ||
              cs.status === SpellStatusEnum.Prepared ||
              cs.always_prepared,
          )
          .map((cs) => cs.spell_id),
      );
      for (const spell of requestedSpells) {
        if (!spellbookSpellIds.has(spell.id)) {
          throw new BadRequestException(
            `'${spell.name}' nao esta no grimorio do personagem.`,
          );
        }
      }
    }

    // Apply changes: unprepare all non-always_prepared non-cantrip spells, then prepare requested
    const requestedSpellIds = new Set(requestedSpells.map((s) => s.id));

    for (const cs of charSpells) {
      if (cs.always_prepared || cs.spell.level === 0) continue;
      if (cs.source !== SpellSourceEnum.Class) continue;

      if (requestedSpellIds.has(cs.spell_id)) {
        // Should be prepared
        if (cs.status !== SpellStatusEnum.Prepared) {
          // For spellbook: spell stays in spellbook, we mark prepared via a flag
          // Actually in the entity model, we use status field
          // Spellbook spells that are prepared: we keep status as Spellbook but the fetch logic checks
          // Wait - let me reconsider. The status enum is known|prepared|spellbook
          // For wizard: spellbook spells that are "prepared" should keep status=Spellbook
          // but we need another way to track which ones are currently prepared
          // Looking at the existing model, Wizard spells at creation are saved as status=Spellbook
          // The sheet displays them separately. So we need to handle this differently.
        }
      }
    }

    // Simpler approach: For total_access casters (Cleric/Druid/Paladin), we manage
    // CharacterSpellEntity records directly (add/remove prepared spells from the class list).
    // For Wizard, we toggle a subset of spellbook entries to "prepared" status.

    if (casterType === "total_access") {
      // Remove all existing class prepared (non-always_prepared) spells
      const toRemove = charSpells.filter(
        (cs) =>
          cs.source === SpellSourceEnum.Class &&
          cs.status === SpellStatusEnum.Prepared &&
          !cs.always_prepared &&
          cs.spell.level > 0,
      );
      if (toRemove.length > 0) {
        await this.charSpellRepo.remove(toRemove);
      }

      // Add new prepared spells
      for (const spell of requestedSpells) {
        // Check if already exists (e.g., always_prepared or from another source)
        const existing = charSpells.find((cs) => cs.spell_id === spell.id);
        if (existing) continue;

        await this.charSpellRepo.save({
          character_id: characterId,
          spell_id: spell.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Prepared,
          always_prepared: false,
        });
      }
    } else if (casterType === "spellbook") {
      // For Wizard: all spells stay in spellbook, but we toggle status between
      // 'spellbook' (not prepared) and 'prepared' (prepared from spellbook)
      // Also clean up duplicate records when found
      const bySpellId = new Map<string, CharacterSpellEntity[]>();
      for (const cs of charSpells) {
        if (cs.source !== SpellSourceEnum.Class || cs.spell.level === 0)
          continue;
        if (cs.always_prepared) continue;
        const existing = bySpellId.get(cs.spell_id) ?? [];
        existing.push(cs);
        bySpellId.set(cs.spell_id, existing);
      }

      for (const [spellId, records] of bySpellId) {
        // Keep first, delete extras
        const keep = records[0];
        for (let i = 1; i < records.length; i++) {
          await this.charSpellRepo.remove(records[i]);
        }

        const shouldBePrepared = requestedSpellIds.has(spellId);
        const newStatus = shouldBePrepared
          ? SpellStatusEnum.Prepared
          : SpellStatusEnum.Spellbook;

        if (keep.status !== newStatus) {
          keep.status = newStatus;
          await this.charSpellRepo.save(keep);
        }
      }
    }

    const prepared = requestedSpells.map((s) => ({
      slug: s.slug,
      name: s.name,
      level: s.level,
    }));

    return {
      prepared,
      maxPrepared,
      casterType,
    };
  }

  // ---- GET /characters/:id/available-spells ----

  async getAvailableSpells(
    userId: string,
    characterId: string,
  ): Promise<AvailableSpellsResult[]> {
    const character = await this.ensureOwnership(userId, characterId);

    const [charClasses, charAbilities, charSpells] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
    ]);

    const maxSpellLevel = this.getMaxSpellLevel(charClasses);
    const results: AvailableSpellsResult[] = [];
    const editionRules = character.source?.rules;

    for (const cc of charClasses) {
      const classSlug = cc.class.slug;
      const casterType = getCasterClassType(classSlug);
      if (!casterType) continue;

      const maxPrepared = this.computeMaxPrepared(
        classSlug,
        cc.class_level,
        charAbilities,
        editionRules,
      );

      // Current prepared spells (deduplicated)
      const seenPrepared = new Set<string>();
      const currentPrepared = charSpells
        .filter(
          (cs) =>
            cs.source === SpellSourceEnum.Class &&
            cs.spell.level > 0 &&
            (cs.status === SpellStatusEnum.Prepared || cs.always_prepared),
        )
        .filter((cs) => {
          if (seenPrepared.has(cs.spell.slug)) return false;
          seenPrepared.add(cs.spell.slug);
          return true;
        })
        .map((cs) => ({
          slug: cs.spell.slug,
          name: cs.spell.name,
          level: cs.spell.level,
          alwaysPrepared: cs.always_prepared,
        }));

      // Available spells depend on caster type
      let availableSpells: Array<{
        slug: string;
        name: string;
        level: number;
        school?: string;
      }> = [];

      if (casterType === "total_access") {
        // Can prepare any spell from the class list up to max spell level
        const classSpells = await this.spellClassRepo.find({
          where: { class_id: cc.class_id },
          relations: ["spell", "spell.school"],
        });
        const seenSlugs = new Set<string>();
        availableSpells = classSpells
          .filter((sc) => sc.spell.level > 0 && sc.spell.level <= maxSpellLevel)
          .filter((sc) => {
            if (seenSlugs.has(sc.spell.slug)) return false;
            seenSlugs.add(sc.spell.slug);
            return true;
          })
          .map((sc) => ({
            slug: sc.spell.slug,
            name: sc.spell.name,
            level: sc.spell.level,
            school: sc.spell.school?.name,
          }));
      } else if (casterType === "spellbook") {
        // Wizard: can prepare from spellbook (deduplicated)
        const seenBook = new Set<string>();
        availableSpells = charSpells
          .filter(
            (cs) =>
              cs.source === SpellSourceEnum.Class &&
              cs.spell.level > 0 &&
              (cs.status === SpellStatusEnum.Spellbook ||
                cs.status === SpellStatusEnum.Prepared),
          )
          .filter((cs) => {
            if (seenBook.has(cs.spell.slug)) return false;
            seenBook.add(cs.spell.slug);
            return true;
          })
          .map((cs) => ({
            slug: cs.spell.slug,
            name: cs.spell.name,
            level: cs.spell.level,
            school: cs.spell.school?.name,
          }));
      } else {
        // Known/Pact casters: their known spells are always prepared
        availableSpells = charSpells
          .filter(
            (cs) =>
              cs.source === SpellSourceEnum.Class &&
              cs.spell.level > 0 &&
              (cs.status === SpellStatusEnum.Known ||
                cs.status === SpellStatusEnum.Prepared),
          )
          .map((cs) => ({
            slug: cs.spell.slug,
            name: cs.spell.name,
            level: cs.spell.level,
            school: cs.spell.school?.name,
          }));
      }

      // Determine how spells can be changed on long rest per SRD 5.2.1
      const baseSlug = normalizeClassSlug(classSlug);
      let prepChangeMode: "all" | "one" | "none" = "none";
      if (
        casterType === "total_access" &&
        (baseSlug === "cleric" || baseSlug === "druid")
      ) {
        prepChangeMode = "all";
      } else if (
        casterType === "total_access" &&
        (baseSlug === "paladin" || baseSlug === "ranger")
      ) {
        prepChangeMode = "one";
      } else if (casterType === "spellbook") {
        prepChangeMode = "all";
      }
      // known/pact => 'none' (only on level up)

      results.push({
        classSlug,
        casterType,
        maxPrepared,
        maxSpellLevel,
        prepChangeMode,
        currentPrepared,
        availableSpells,
      });
    }

    return results;
  }

  // ---- GET /characters/:id/manageable-spells ----

  async getManageableSpells(
    userId: string,
    characterId: string,
  ): Promise<ManageableSpellsResult[]> {
    const character = await this.ensureOwnership(userId, characterId);

    const [charClasses, charAbilities, charSpells] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({
        where: { character_id: characterId },
        relations: ["spell", "spell.school"],
      }),
    ]);

    const maxSpellLevel = this.getMaxSpellLevel(charClasses);
    const results: ManageableSpellsResult[] = [];
    const editionRules = character.source?.rules;

    for (const cc of charClasses) {
      const classSlug = cc.class.slug;
      const casterType = getCasterClassType(classSlug);
      if (!casterType) continue;

      const maxPrepared = this.computeMaxPrepared(
        classSlug,
        cc.class_level,
        charAbilities,
        editionRules,
      );

      // Current character spells (deduplicated)
      const seenSlugs = new Set<string>();
      const currentSpells = charSpells
        .filter(
          (cs) => cs.source === SpellSourceEnum.Class && cs.spell.level >= 0,
        )
        .filter((cs) => {
          if (seenSlugs.has(cs.spell.slug)) return false;
          seenSlugs.add(cs.spell.slug);
          return true;
        })
        .map((cs) => ({
          slug: cs.spell.slug,
          name: cs.spell.name,
          level: cs.spell.level,
          status: cs.status,
          alwaysPrepared: cs.always_prepared,
          canRemove: !cs.always_prepared || cs.spell.level > 0,
        }))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

      // Spells available to learn from the class list
      const classSpells = await this.spellClassRepo.find({
        where: { class_id: cc.class_id },
        relations: ["spell", "spell.school"],
      });

      const currentSpellSlugs = new Set(currentSpells.map((s) => s.slug));
      const seenAvailable = new Set<string>();
      const availableToLearn = classSpells
        .filter(
          (sc) =>
            sc.spell.level <= maxSpellLevel &&
            !currentSpellSlugs.has(sc.spell.slug),
        )
        .filter((sc) => {
          if (seenAvailable.has(sc.spell.slug)) return false;
          seenAvailable.add(sc.spell.slug);
          return true;
        })
        .map((sc) => ({
          slug: sc.spell.slug,
          name: sc.spell.name,
          level: sc.spell.level,
          school: sc.spell.school?.name,
        }))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

      results.push({
        classSlug,
        className: cc.class.name,
        casterType,
        maxPrepared,
        maxSpellLevel,
        currentSpells,
        availableToLearn,
      });
    }

    return results;
  }

  // ---- POST /characters/:id/spells ----

  async learnSpell(
    userId: string,
    characterId: string,
    dto: LearnSpellDto,
  ): Promise<LearnSpellResult> {
    await this.ensureOwnership(userId, characterId);

    const spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {
      throw new BadRequestException(`Magia '${dto.spellSlug}' nao encontrada.`);
    }

    // Check if already known
    const existing = await this.charSpellRepo.findOne({
      where: { character_id: characterId, spell_id: spell.id },
    });
    if (existing) {
      throw new BadRequestException(
        `Personagem ja conhece a magia '${spell.name}'.`,
      );
    }

    // Find the caster class for this spell
    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
      order: { order: "ASC" },
    });

    let targetClass: CharacterClassEntity | undefined;
    for (const cc of charClasses) {
      const casterType = getCasterClassType(cc.class.slug);
      if (!casterType) continue;
      const link = await this.spellClassRepo.findOne({
        where: { class_id: cc.class_id, spell_id: spell.id },
      });
      if (link) {
        targetClass = cc;
        break;
      }
    }

    if (!targetClass) {
      throw new BadRequestException(
        `'${spell.name}' nao pertence a lista de nenhuma classe do personagem.`,
      );
    }

    const casterType = getCasterClassType(targetClass.class.slug)!;

    // Determine status based on caster type
    let status: SpellStatusEnum;
    if (spell.level === 0) {
      status = SpellStatusEnum.Known;
    } else if (casterType === "spellbook") {
      status = SpellStatusEnum.Spellbook;
    } else if (casterType === "known" || casterType === "pact") {
      status = SpellStatusEnum.Known;
    } else {
      // total_access: add as prepared
      status = SpellStatusEnum.Prepared;
    }

    await this.charSpellRepo.save({
      character_id: characterId,
      spell_id: spell.id,
      source: SpellSourceEnum.Class,
      status,
      always_prepared: spell.level === 0,
    });

    return {
      slug: spell.slug,
      name: spell.name,
      level: spell.level,
      status,
      message: `Magia '${spell.name}' aprendida com sucesso.`,
    };
  }

  // ---- DELETE /characters/:id/spells/:spellSlug ----

  async unlearnSpell(
    userId: string,
    characterId: string,
    spellSlug: string,
  ): Promise<UnlearnSpellResult> {
    await this.ensureOwnership(userId, characterId);

    const charSpells = await this.charSpellRepo.find({
      where: { character_id: characterId },
      relations: ["spell"],
    });

    const toRemove = charSpells.filter(
      (cs) =>
        cs.spell.slug === spellSlug && cs.source === SpellSourceEnum.Class,
    );

    if (toRemove.length === 0) {
      throw new BadRequestException(
        `Magia '${spellSlug}' nao encontrada entre as magias do personagem.`,
      );
    }

    const spellName = toRemove[0].spell.name;
    await this.charSpellRepo.remove(toRemove);

    return {
      slug: spellSlug,
      message: `Magia '${spellName}' removida com sucesso.`,
    };
  }

  // ---- PATCH /characters/:id/spell-slots ----

  async updateSpellSlots(
    userId: string,
    characterId: string,
    dto: SpellSlotUpdateDto,
  ): Promise<SpellSlotUpdateResult> {
    await this.ensureOwnership(userId, characterId);

    const [charClasses, state] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.getState(characterId),
    ]);

    const slotTotals = this.getSpellSlotTotals(charClasses);
    const levelKey = String(dto.level);

    // Check if pact slot
    const isPact = dto.level === -1; // convention: -1 = pact slots
    const key = isPact ? "pact" : levelKey;

    const total = slotTotals[key];
    if (total === undefined || total === 0) {
      throw new BadRequestException(
        `Personagem nao possui spell slots de nivel ${isPact ? "pact" : dto.level}.`,
      );
    }

    if (dto.used < 0 || dto.used > total) {
      throw new BadRequestException(
        `Valor invalido para slots usados. Deve ser entre 0 e ${total}.`,
      );
    }

    const slotsUsed = { ...state.spell_slots_used };
    slotsUsed[key] = dto.used;
    state.spell_slots_used = slotsUsed;
    await this.stateRepo.save(state);

    return {
      level: dto.level,
      total,
      used: dto.used,
    };
  }

  /**
   * Spec 011 Phase 1 — zera entries de `feature_uses_used` cujo
   * `FeatureSpec.rechargeOn` bate com `restType` (ou qualquer entry se
   * `restType === 'long'`). Retorna os slugs afetados para compor o summary.
   * Mutação in-place em `state.feature_uses_used`.
   */
  private resetFeatureUses(
    state: CharacterStateEntity,
    restType: "short" | "long",
  ): string[] {
    const used: Record<string, number> = { ...(state.feature_uses_used ?? {}) };
    const reset: string[] = [];

    for (const slug of Object.keys(used)) {
      if (used[slug] <= 0) continue;
      if (restType === "long") {
        used[slug] = 0;
        reset.push(slug);
        continue;
      }
      const spec = CLASS_FEATURE_CATALOG.find((s) => s.slug === slug);
      // Só zera entries cuja feature recarrega em short rest. Entries
      // desconhecidas ou de recarga long persistem.
      if (spec?.rechargeOn === "short") {
        used[slug] = 0;
        reset.push(slug);
      }
    }

    state.feature_uses_used = used;
    return reset;
  }

  // ---- POST /characters/:id/rest ----

  async rest(
    userId: string,
    characterId: string,
    dto: RestDto,
  ): Promise<RestResult> {
    await this.ensureOwnership(userId, characterId);

    const [charClasses, charAbilities, state] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.getState(characterId),
    ]);

    const summary: string[] = [];
    let hpRestored = 0;
    let slotsRestored = false;
    let hitDiceRecovered = 0;
    let deathSavesReset = false;

    if (dto.type === "short") {
      // Short rest: Warlock recovers pact slots
      const hasWarlock = charClasses.some(
        (cc) => normalizeClassSlug(cc.class.slug) === "warlock",
      );
      if (hasWarlock) {
        const slotsUsed = {
          ...state.spell_slots_used,
        };
        if (slotsUsed["pact"] && slotsUsed["pact"] > 0) {
          slotsUsed["pact"] = 0;
          state.spell_slots_used = slotsUsed;
          slotsRestored = true;
          summary.push("Pact Magic slots recuperados.");
        }
      }

      // Spend hit dice to heal
      if (dto.hitDiceToSpend?.length) {
        const maxHp = await this.computeMaxHp(
          characterId,
          charClasses,
          charAbilities,
        );
        const conMod = this.getAbilityMod(charAbilities, "con");
        const hitDiceUsed = {
          ...state.hit_dice_used,
        };

        for (const hd of dto.hitDiceToSpend) {
          const cc = charClasses.find((c) => c.class.slug === hd.classSlug);
          if (!cc) continue;

          const available = cc.class_level - (hitDiceUsed[hd.classSlug] ?? 0);
          const toSpend = Math.min(hd.count, available);
          if (toSpend <= 0) continue;

          hitDiceUsed[hd.classSlug] =
            (hitDiceUsed[hd.classSlug] ?? 0) + toSpend;

          // Each hit die heals: roll (average = die/2 + 0.5) + CON mod; use fixed
          const healPerDie = Math.max(
            1,
            Math.floor(cc.class.hit_die / 2) + 1 + conMod,
          );
          const healing = healPerDie * toSpend;
          state.current_hp = Math.min(maxHp, state.current_hp + healing);
          hpRestored += healing;

          summary.push(
            `Gastou ${toSpend}d${cc.class.hit_die}, curou ${healing} HP.`,
          );
        }

        state.hit_dice_used = hitDiceUsed;
      }

      // Restore ki points on short rest
      if (state.ki_points_used > 0) {
        state.ki_points_used = 0;
        summary.push("Pontos de Ki restaurados.");
      }

      // Spec 011 Phase 1 — reset class-feature uses that recharge on a short rest.
      const resetShort = this.resetFeatureUses(state, "short");
      if (resetShort.length > 0) {
        summary.push(`Features recuperadas: ${resetShort.join(", ")}.`);
      }

      await this.stateRepo.save(state);

      await this.advanceClockAfterRest(characterId, 1, "short_rest");
    } else {
      // Long rest
      const maxHp = await this.computeMaxHp(
        characterId,
        charClasses,
        charAbilities,
      );

      // 1. Restore HP to max
      hpRestored = maxHp - state.current_hp;
      state.current_hp = maxHp;
      state.temp_hp = 0;
      summary.push(`HP restaurado ao maximo (${maxHp}).`);

      // 2. Restore all spell slots
      const slotsUsed = state.spell_slots_used;
      const hadUsedSlots = Object.values(slotsUsed).some((v) => v > 0);
      state.spell_slots_used = {};
      if (hadUsedSlots) {
        slotsRestored = true;
        summary.push("Todos os spell slots recuperados.");
      }

      // 3. Recover half of total hit dice (rounded down, min 1)
      const hitDiceUsed = {
        ...state.hit_dice_used,
      };
      const totalHitDice = charClasses.reduce((s, cc) => s + cc.class_level, 0);
      const totalUsed = Object.values(hitDiceUsed).reduce((s, v) => s + v, 0);
      const toRecover = Math.max(1, Math.floor(totalHitDice / 2));
      let recovered = 0;

      // Distribute recovery across classes proportionally
      for (const cc of charClasses) {
        if (recovered >= toRecover) break;
        const used = hitDiceUsed[cc.class.slug] ?? 0;
        if (used <= 0) continue;
        const recoverFromThis = Math.min(used, toRecover - recovered);
        hitDiceUsed[cc.class.slug] = used - recoverFromThis;
        recovered += recoverFromThis;
      }

      state.hit_dice_used = hitDiceUsed;
      hitDiceRecovered = recovered;
      if (recovered > 0) {
        summary.push(`${recovered} dado(s) de vida recuperado(s).`);
      }

      // 4. Reset death saves
      if (state.death_saves_success > 0 || state.death_saves_fail > 0) {
        state.death_saves_success = 0;
        state.death_saves_fail = 0;
        deathSavesReset = true;
        summary.push("Death saves resetados.");
      }

      // 5. Restore ki points
      if (state.ki_points_used > 0) {
        state.ki_points_used = 0;
        summary.push("Pontos de Ki restaurados.");
      }

      // Spec 011 Phase 1 — long rest recovers every class-feature use.
      const resetAll = this.resetFeatureUses(state, "long");
      if (resetAll.length > 0) {
        summary.push(`Features recuperadas: ${resetAll.join(", ")}.`);
      }

      await this.stateRepo.save(state);

      const maxSpellLevel = this.getMaxSpellLevel(charClasses);

      // 5. Handle prepared spell changes on long rest
      if (dto.preparedSpells) {
        await this.updatePreparedSpells(userId, characterId, {
          spells: dto.preparedSpells,
        });
        summary.push("Magias preparadas atualizadas.");
      }

      // 6. Handle single spell swap on long rest (Paladin/Ranger)
      if (dto.spellSwap) {
        const { removeSlug, addSlug } = dto.spellSwap;
        const charSpells = await this.charSpellRepo.find({
          where: { character_id: characterId },
          relations: ["spell"],
        });

        const toRemove = charSpells.find(
          (cs) =>
            cs.spell.slug === removeSlug &&
            cs.source === SpellSourceEnum.Class &&
            cs.spell.level > 0 &&
            !cs.always_prepared,
        );
        if (!toRemove) {
          throw new BadRequestException(
            `Magia '${removeSlug}' nao encontrada entre as magias preparadas.`,
          );
        }

        const newSpell = await this.spellRepo.findOne({
          where: { slug: addSlug },
        });
        if (!newSpell || newSpell.level === 0) {
          throw new BadRequestException(
            `Magia '${addSlug}' nao encontrada ou e um cantrip.`,
          );
        }

        if (newSpell.level > maxSpellLevel) {
          throw new BadRequestException(
            `'${newSpell.name}' e nivel ${newSpell.level}, mas o nivel maximo de slot e ${maxSpellLevel}.`,
          );
        }

        // Validate the new spell belongs to the caster's class list
        const casterClass = charClasses.find((cc) =>
          getCasterClassType(cc.class.slug),
        );
        if (casterClass) {
          const classSpells = await this.spellClassRepo.find({
            where: { class_id: casterClass.class_id },
          });
          const validIds = new Set(classSpells.map((sc) => sc.spell_id));
          if (!validIds.has(newSpell.id)) {
            throw new BadRequestException(
              `'${newSpell.name}' nao esta na lista de ${casterClass.class.name}.`,
            );
          }
        }

        await this.charSpellRepo.remove(toRemove);
        await this.charSpellRepo.save({
          character_id: characterId,
          spell_id: newSpell.id,
          source: SpellSourceEnum.Class,
          status: toRemove.status, // keep same status (Known or Prepared)
          always_prepared: false,
        });

        summary.push(
          `Magia trocada: '${toRemove.spell.name}' -> '${newSpell.name}'.`,
        );
      }
    }

    let restEvent: { kind: RestEventTriggered } | null = null;
    if (dto.type === "long") {
      try {
        const decay = await this.reputationDecayService.applyOnLongRest(
          characterId,
        );
        if (decay.npcsDecayed > 0) {
          summary.push(
            `Reputação esfriou: ${decay.npcsDecayed} NPC(s) suavizaram seus ânimos.`,
          );
        }
      } catch {
        /* best-effort */
      }

      await this.advanceClockAfterRest(characterId, 8, "long_rest");

      const kind = await this.rollRestEvent();
      if (kind) {
        restEvent = { kind };
      }
    }

    return {
      type: dto.type,
      hpRestored,
      currentHp: state.current_hp,
      slotsRestored,
      hitDiceRecovered,
      deathSavesReset,
      summary,
      restEvent,
    };
  }

  private async computeMaxHp(
    characterId: string,
    charClasses: CharacterClassEntity[],
    charAbilities: CharacterAbilityScoreEntity[],
  ): Promise<number> {
    const primaryClass = charClasses[0];
    if (!primaryClass) return 10;

    const conMod = this.getAbilityMod(charAbilities, "con");
    let maxHp = primaryClass.class.hit_die + conMod;

    const levelUps = await this.charLevelUpRepo.find({
      where: { character_id: characterId },
    });
    for (const lu of levelUps) {
      maxHp += lu.hp_gained;
    }

    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    maxHp += state?.max_hp_bonus ?? 0;

    return maxHp;
  }
}
