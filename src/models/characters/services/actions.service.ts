import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterEquipmentEntity,
  CharacterFeatureEntity,
  CharacterStateEntity,
  EquipmentCategoryItemEntity,
  ClassProficiencyEntity,
} from 'src/entities';
import { ProficiencyTypeEnum } from 'src/entities/enums';
import {
  PROF_BONUS_BY_LEVEL,
  getSpellcastingAbility,
  normalizeClassSlug,
} from 'src/shared/srd-constants';
import { getAbilityModifier, isEquipmentProficient, DRACONIC_ANCESTRY_MAP } from 'src/shared/srd-utils';

// ---- Types ----

export type ActionTiming = 'action' | 'bonus_action' | 'reaction' | 'free' | 'movement';
export type ActionSource = 'weapon' | 'spell' | 'feature' | 'base' | 'consumable';

export interface DamageBlock {
  dice: string;
  type: string;
  bonus?: number;
}

export interface ActionBlock {
  id: string;
  name: string;
  timing: ActionTiming;
  source: ActionSource;
  sourceLabel: string;
  description: string;
  attackBonus?: number;
  damage?: DamageBlock;
  versatileDamage?: DamageBlock;
  saveDc?: number;
  saveAbility?: string;
  /** Spec 011 Phase 2 — `dc_success` do SRD ('half' | 'none' | 'negates'). */
  saveSuccess?: 'half' | 'none' | 'negates';
  /** Spec 011 Phase 3 — slug canônico da feature/spell (sem prefixo `feature-{uuid}-`).
   *  Usado pelo front pra resolver `POST /class-feature` e `POST /cast-spell`. */
  featureSlug?: string;
  range?: string;
  properties?: string[];
  /** Spec 012 — weapon slug (for weapon actions) pra lookup de mastery/Fighting Style. */
  weaponSlug?: string;
  /** Spec 012 — mastery slug (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex). Only present if
   *  (a) arma tem a propriedade E (b) dono da arma escolheu este weapon slug em weapon_mastery_choices. */
  masterySlug?: string;
  uses?: number;
  usesMax?: number;
  usesRecharge?: string;
  spellLevel?: number;
  requiresConcentration?: boolean;
  isRitual?: boolean;
  castingTime?: string;
  /** Spec 005 US14 — área de efeito derivada de `spell.area_of_effect` + `spell.range`.
   *  Populado somente para spells AoE (Acid Splash, Burning Hands, Fireball, etc.). */
  aoe?: {
    originType: 'self' | 'point' | 'fixed';
    shape: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
    sizeFt: number;
    rangeFt: number;
  };
}

export interface ActionsResponse {
  actions: ActionBlock[];
  bonusActions: ActionBlock[];
  reactions: ActionBlock[];
  movement: { speed: number };
  summary: {
    attackCount: number;
    hasExtraAttack: boolean;
    spellSaveDc: Record<string, number>;
    spellAttackBonus: Record<string, number>;
  };
}

@Injectable()
export class ActionsService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterProficiencyEntity)
    private readonly charProfRepo: Repository<CharacterProficiencyEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly charSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly charEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterFeatureEntity)
    private readonly charFeatureRepo: Repository<CharacterFeatureEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(EquipmentCategoryItemEntity)
    private readonly equipCatItemRepo: Repository<EquipmentCategoryItemEntity>,
    @InjectRepository(ClassProficiencyEntity)
    private readonly classProfRepo: Repository<ClassProficiencyEntity>,
  ) {}

  async getActions(userId: string, characterId: string): Promise<ActionsResponse> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId, userId },
      relations: ['character_origin'],
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }

    const [
      charClasses,
      charAbilities,
      charProfs,
      charSpells,
      charEquip,
      charFeatures,
      charState,
    ] = await Promise.all([
      this.charClassRepo.find({ where: { character_id: characterId }, order: { order: 'ASC' } }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charProfRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
      this.charEquipRepo.find({ where: { character_id: characterId } }),
      this.charFeatureRepo.find({ where: { character_id: characterId } }),
      this.charStateRepo.findOne({ where: { character_id: characterId } }),
    ]);

    // Ability helpers
    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }
    const mod = (slug: string) => getAbilityModifier(abilityMap.get(slug) ?? 10);
    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);
    const profBonus = PROF_BONUS_BY_LEVEL[Math.min(totalLevel, 20)] ?? 2;

    // Build weapon proficiency set
    const profSlugs = new Set(
      charProfs
        .filter(
          (cp) =>
            cp.proficiency.proficiency_type === ProficiencyTypeEnum.Weapon ||
            cp.proficiency.proficiency_type === ProficiencyTypeEnum.Other,
        )
        .map((cp) => cp.proficiency.slug),
    );

    const classIds = charClasses.map((cc) => cc.class_id);
    if (classIds.length > 0) {
      const classProfs = await this.classProfRepo
        .createQueryBuilder('cp')
        .innerJoinAndSelect('cp.proficiency', 'p')
        .where('cp.class_id IN (:...classIds)', { classIds })
        .getMany();
      for (const cp of classProfs) {
        if (
          cp.proficiency.proficiency_type === ProficiencyTypeEnum.Weapon ||
          cp.proficiency.proficiency_type === ProficiencyTypeEnum.Other
        ) {
          profSlugs.add(cp.proficiency.slug);
        }
      }
    }

    // Equipment category map for proficiency checking
    const equipIds = charEquip.map((ce) => ce.equipment_id);
    const equipCatMap = new Map<string, Set<string>>();
    if (equipIds.length > 0) {
      const catItems = await this.equipCatItemRepo.find({
        where: equipIds.map((eid) => ({ equipment_id: eid })),
        relations: ['category'],
      });
      for (const ci of catItems) {
        let s = equipCatMap.get(ci.equipment_id);
        if (!s) {
          s = new Set();
          equipCatMap.set(ci.equipment_id, s);
        }
        s.add(ci.category.slug);
      }
    }

    // Detect extra attack — Fighter scales: 2 at 5, 3 at 11, 4 at 20
    const hasExtraAttack = charFeatures.some(
      (cf) => cf.feature?.slug?.includes('extra-attack') && cf.active,
    );
    const fighterClass = charClasses.find((cc) =>
      normalizeClassSlug(cc.class.slug) === 'fighter',
    );
    let attackCount = 1;
    if (hasExtraAttack) {
      if (fighterClass) {
        const fl = fighterClass.class_level;
        attackCount = fl >= 20 ? 4 : fl >= 11 ? 3 : 2;
      } else {
        attackCount = 2;
      }
    }

    // Spellcasting info per class
    const spellSaveDc: Record<string, number> = {};
    const spellAttackBonus: Record<string, number> = {};
    for (const cc of charClasses) {
      const scAbility = getSpellcastingAbility(cc.class.slug);
      if (scAbility) {
        spellSaveDc[cc.class.slug] = 8 + profBonus + mod(scAbility);
        spellAttackBonus[cc.class.slug] = profBonus + mod(scAbility);
      }
    }

    const speed = character.character_origin?.race?.speed ?? 30;

    // Spec 012 — weapon mastery choices: armas (slugs) que o personagem "dominou".
    // Usado em buildWeaponActions pra expor masterySlug só quando o jogador tiver
    // escolhido essa arma (XPHB 2024: N masteries por level, subiu conforme classe).
    const masteryChoices = new Set<string>(
      character.character_origin?.weapon_mastery_choices ?? [],
    );

    const allActions: ActionBlock[] = [];

    // 1. Weapon attacks
    this.buildWeaponActions(charEquip, equipCatMap, profSlugs, mod, profBonus, totalLevel, masteryChoices, allActions);

    // 2. Unarmed Strike
    this.buildUnarmedStrike(mod, profBonus, charClasses, charFeatures, allActions);

    // 3. Spell actions
    this.buildSpellActions(charSpells, charClasses, spellSaveDc, spellAttackBonus, totalLevel, allActions);

    // 4. Consumable actions
    this.buildConsumableActions(charEquip, allActions);

    // 5. Feature actions
    this.buildFeatureActions(charFeatures, charClasses, charState, profBonus, mod, allActions);

    // 6. Race trait actions (e.g. Breath Weapon)
    this.buildRaceTraitActions(character, totalLevel, profBonus, mod, allActions);

    // Split by timing
    const actions = allActions.filter((a) => a.timing === 'action');
    const bonusActions = allActions.filter((a) => a.timing === 'bonus_action');
    const reactions = allActions.filter((a) => a.timing === 'reaction');

    return {
      actions,
      bonusActions,
      reactions,
      movement: { speed },
      summary: {
        attackCount,
        hasExtraAttack,
        spellSaveDc,
        spellAttackBonus,
      },
    };
  }

  // ---- Weapon attacks ----

  private buildWeaponActions(
    charEquip: CharacterEquipmentEntity[],
    equipCatMap: Map<string, Set<string>>,
    profSlugs: Set<string>,
    mod: (s: string) => number,
    profBonus: number,
    _totalLevel: number,
    masteryChoices: Set<string>,
    out: ActionBlock[],
  ) {
    const strMod = mod('str');
    const dexMod = mod('dex');

    for (const ce of charEquip) {
      const eq = ce.equipment;
      // Spec 012: PC deve poder usar QUALQUER arma que carrega (RAW 2024:
      // sacar arma é free object interaction por turno). Antes o filtro
      // `!ce.equipped` escondia arco do ranger (só scimitar ficava equipped
      // por causa de `shouldEquip` limitar 1 weapon slot). Mantemos o dano
      // como válido, só checamos se é mesmo uma arma (tem damage).
      if (!eq.damage) continue;

      // Spec 012 fix: equipment.damage é persistida com shape `{dice, type}`
      // (formato direto do transformer), não `{damage_dice, damage_type}` do
      // SRD 5e legado. buildWeaponActions lia o shape errado → continue silencioso
      // sempre → ActionBar só mostrava Ataque Desarmado. Aceita ambos shapes.
      const dmg = eq.damage as {
        damage_dice?: string;
        damage_type?: { name?: string; index?: string };
        dice?: string;
        type?: string;
      };
      const damageDice = dmg.damage_dice ?? dmg.dice;
      if (!damageDice) continue;

      const props = (eq.properties ?? []) as Array<{ name?: string; index?: string; slug?: string }>;
      // Spec 012 Fase 0 fix: admin seeder popula `{name, slug}` (não `{index}`),
      // então propSlugs ficava vazio e thrown/finesse/heavy nunca disparavam.
      // Aceita ambos shapes pra compat.
      const propSlugs = props.map((p) => p.index ?? p.slug ?? '');
      const isFinesse = propSlugs.includes('finesse');
      const isRanged = propSlugs.includes('ammunition') || propSlugs.includes('thrown');
      const isTwoHanded = propSlugs.includes('two-handed');
      const isVersatile = propSlugs.includes('versatile');
      const isThrown = propSlugs.includes('thrown');
      const propNames = props.map((p) => p.name ?? '').filter(Boolean);

      // Determine ability modifier
      let abilityMod: number;
      if (isFinesse) {
        abilityMod = Math.max(strMod, dexMod);
      } else if (isRanged && !isThrown) {
        abilityMod = dexMod;
      } else {
        abilityMod = strMod;
      }

      // Check proficiency
      const cats = equipCatMap.get(ce.equipment_id) ?? new Set<string>();
      const isProficient = isEquipmentProficient(eq.slug, cats, profSlugs) === true;

      const attackBonus = abilityMod + (isProficient ? profBonus : 0);
      const damageType = dmg.damage_type?.name ?? dmg.type ?? 'Unknown';
      const damageBonus = abilityMod;

      const range = eq.range as { normal?: number; long?: number } | null;
      let rangeStr = '5 ft';
      if (range) {
        if (range.long) {
          rangeStr = `${range.normal ?? 5}/${range.long} ft`;
        } else if (range.normal) {
          rangeStr = `${range.normal} ft`;
        }
      }

      // Spec 012 — masterySlug: só expõe se (a) arma tem mastery na DB E (b) o personagem
      // escolheu essa arma em weapon_mastery_choices. Sem isso o combat.service ignora.
      const weaponMastery = eq.mastery as { slug?: string; name?: string } | undefined;
      const masterySlug = weaponMastery?.slug && masteryChoices.has(eq.slug)
        ? weaponMastery.slug
        : undefined;

      const action: ActionBlock = {
        id: `weapon-${ce.id}`,
        name: eq.name,
        timing: 'action',
        source: 'weapon',
        sourceLabel: isProficient ? 'Arma (proficiente)' : 'Arma',
        description: `Ataque com ${eq.name}. ${isTwoHanded ? 'Requer duas maos.' : ''}`,
        attackBonus,
        damage: {
          dice: damageDice,
          type: damageType,
          bonus: damageBonus,
        },
        range: rangeStr,
        properties: propNames,
        weaponSlug: eq.slug,
        masterySlug,
      };

      if (isVersatile) {
        // Parse versatile damage from properties or add d10 variant
        const versatileProp = props.find((p) => p.index === 'versatile');
        const versatileText = (versatileProp as Record<string, unknown>)?.description as string | undefined;
        const versatileDice = this.parseVersatileDice(versatileText, damageDice);
        action.versatileDamage = {
          dice: versatileDice,
          type: damageType,
          bonus: damageBonus,
        };
      }

      out.push(action);

      // Thrown weapons can also be used as ranged
      if (isThrown && range && (range.normal ?? 0) > 5) {
        out.push({
          ...action,
          id: `weapon-thrown-${ce.id}`,
          name: `${eq.name} (Arremesso)`,
          description: `Arremessa ${eq.name}.`,
          range: `${range.normal ?? 20}/${range.long ?? 60} ft`,
          damage: {
            dice: damageDice,
            type: damageType,
            bonus: abilityMod,
          },
          versatileDamage: undefined,
        });
      }
    }
  }

  // ---- Unarmed Strike ----

  private buildUnarmedStrike(
    mod: (s: string) => number,
    profBonus: number,
    charClasses: CharacterClassEntity[],
    charFeatures: CharacterFeatureEntity[],
    out: ActionBlock[],
  ) {
    const strMod = mod('str');
    const dexMod = mod('dex');

    // Check for Monk Martial Arts
    const monkClass = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'monk');
    let martialArtsDie: string | null = null;
    if (monkClass) {
      const lvl = monkClass.class_level;
      if (lvl >= 17) martialArtsDie = '1d12';
      else if (lvl >= 11) martialArtsDie = '1d10';
      else if (lvl >= 5) martialArtsDie = '1d8';
      else martialArtsDie = '1d6';
    }

    const attackMod = monkClass ? Math.max(strMod, dexMod) : strMod;
    const attackBonus = attackMod + profBonus;
    const damageDice = martialArtsDie ?? '1';
    const damageBonus = attackMod;

    out.push({
      id: 'unarmed-strike',
      name: 'Ataque Desarmado',
      timing: 'action',
      source: 'base',
      sourceLabel: monkClass ? 'Artes Marciais' : 'Base',
      description: monkClass
        ? `Soco, chute ou cabeçada usando Artes Marciais (${martialArtsDie}).`
        : 'Soco, chute ou cabecada. 1 + mod de Forca de dano de concussao.',
      attackBonus,
      damage: {
        dice: damageDice,
        type: 'Bludgeoning',
        bonus: damageBonus,
      },
      range: '5 ft',
    });
  }

  // ---- Spell actions ----

  private buildSpellActions(
    charSpells: CharacterSpellEntity[],
    charClasses: CharacterClassEntity[],
    spellSaveDc: Record<string, number>,
    spellAttackBonus: Record<string, number>,
    totalLevel: number,
    out: ActionBlock[],
  ) {
    // Only include prepared/known/always_prepared spells + cantrips
    const activeSpells = charSpells.filter(
      (cs) =>
        cs.spell.level === 0 ||
        cs.status === 'prepared' ||
        cs.always_prepared,
    );

    // Get the primary spellcasting class for DC/attack
    const primaryCaster = charClasses.find((cc) =>
      getSpellcastingAbility(cc.class.slug),
    );
    const defaultDc = primaryCaster ? spellSaveDc[primaryCaster.class.slug] : 0;
    const defaultAttackBonus = primaryCaster ? spellAttackBonus[primaryCaster.class.slug] : 0;

    for (const cs of activeSpells) {
      const spell = cs.spell;
      const castingTime = (spell.casting_time ?? '').toLowerCase();
      let timing: ActionTiming = 'action';
      if (castingTime.includes('bonus')) timing = 'bonus_action';
      else if (castingTime.includes('reaction')) timing = 'reaction';

      // Normalização — a seed do 5eAPI pode armazenar `damage_type` como
      // objeto `{ name, index }` (shape antigo) OU como array `['fire']` (shape
      // novo que veio na re-seed). Spec 011 Phase 2 aceita ambos.
      const dmg = spell.damage as {
        damage_type?: { name?: string; index?: string } | string[] | string;
        damage_at_character_level?: Record<string, string>;
        damage_at_slot_level?: Record<string, string>;
      } | null;

      const dc = spell.dc as {
        dc_type?: { name?: string; index?: string } | string[];
        dc_success?: string;
      } | null;

      const extractDamageType = (
        raw: typeof dmg extends null ? never : typeof dmg,
      ): string => {
        if (!raw) return 'Unknown';
        const t = raw.damage_type;
        if (!t) return 'Unknown';
        if (Array.isArray(t)) return t[0] ?? 'Unknown';
        if (typeof t === 'string') return t;
        return t.name ?? t.index ?? 'Unknown';
      };

      let damage: DamageBlock | undefined;
      if (dmg) {
        let dice = '';
        if (dmg.damage_at_character_level) {
          // Cantrip scaling
          dice = this.getCantripDamage(dmg.damage_at_character_level, totalLevel);
        } else if (dmg.damage_at_slot_level) {
          // Take the base slot level damage
          const levels = Object.keys(dmg.damage_at_slot_level).sort((a, b) => +a - +b);
          dice = levels.length > 0 ? dmg.damage_at_slot_level[levels[0]] : '';
        } else {
          // Spec 011 Phase 2 — fallback pra seed incompleta: regex '3d6' na
          // descrição. Cobre magias cujo `damage_at_slot_level` veio vazio.
          const rawDesc = Array.isArray(spell.description)
            ? (spell.description as unknown[]).join(' ')
            : typeof spell.description === 'string'
              ? spell.description
              : '';
          const match = rawDesc.match(/(\d+d\d+)\s+(?:\w+\s+)?damage/i);
          if (match) dice = match[1];
        }
        if (dice) {
          damage = {
            dice,
            type: extractDamageType(dmg),
          };
        }
      }

      const description = Array.isArray(spell.description)
        ? spell.description[0] ?? ''
        : typeof spell.description === 'string'
          ? spell.description
          : '';

      // Truncate to first ~150 chars for the action card
      const shortDesc = description.length > 150
        ? description.substring(0, 147) + '...'
        : description;

      const action: ActionBlock = {
        id: `spell-${spell.slug}`,
        name: spell.name,
        timing,
        source: 'spell',
        sourceLabel: spell.level === 0 ? 'Truque' : `Magia Nivel ${spell.level}`,
        description: shortDesc,
        range: spell.range ?? 'Self',
        spellLevel: spell.level,
        requiresConcentration: spell.concentration ?? false,
        isRitual: spell.ritual ?? false,
        castingTime: spell.casting_time,
      };

      // Spec 005 US14 — popular `aoe` quando a spell é de área. Sem isso,
      // o frontend abre TargetSelector single em vez de MultiTargetSpellPicker.
      const aoeRaw = spell.area_of_effect as
        | { type?: string; size?: number }
        | null
        | undefined;
      if (aoeRaw && aoeRaw.type && typeof aoeRaw.size === 'number') {
        const validShapes = ['sphere', 'cone', 'line', 'cube', 'cylinder'] as const;
        const shape = (validShapes as readonly string[]).includes(aoeRaw.type)
          ? (aoeRaw.type as (typeof validShapes)[number])
          : 'sphere';
        const rangeStr = spell.range ?? 'Self';
        const isSelf = rangeStr.toLowerCase().includes('self');
        const rangeMatch = rangeStr.match(/(\d+)/);
        const rangeFt = isSelf ? 0 : rangeMatch ? parseInt(rangeMatch[1], 10) : 0;
        action.aoe = {
          originType: isSelf ? 'self' : 'point',
          shape,
          sizeFt: aoeRaw.size,
          rangeFt,
        };
      }

      if (spell.attack_type) {
        action.attackBonus = defaultAttackBonus;
      }

      if (damage) {
        action.damage = damage;
      }

      if (dc) {
        action.saveDc = defaultDc;
        const rawDcType = dc.dc_type;
        if (Array.isArray(rawDcType)) {
          action.saveAbility = rawDcType[0] ?? '';
        } else if (rawDcType && typeof rawDcType === 'object') {
          action.saveAbility = rawDcType.index ?? rawDcType.name ?? '';
        } else {
          action.saveAbility = '';
        }
        if (dc.dc_success === 'half' || dc.dc_success === 'none' || dc.dc_success === 'negates') {
          action.saveSuccess = dc.dc_success;
        }
      }

      out.push(action);
    }
  }

  // ---- Consumable actions ----

  private buildConsumableActions(
    charEquip: CharacterEquipmentEntity[],
    out: ActionBlock[],
  ) {
    for (const ce of charEquip) {
      const eq = ce.equipment;
      const effect = eq.consumable_effect as {
        type?: string;
        label?: string;
        dice?: string;
        damageType?: string;
        actionCost?: string;
        range?: number;
        saveDc?: Record<string, unknown>;
      } | null;

      if (!effect || !effect.label) continue;

      const timingMap: Record<string, ActionTiming> = {
        action: 'action',
        bonus_action: 'bonus_action',
        reaction: 'reaction',
      };
      const timing = timingMap[effect.actionCost ?? 'action'] ?? 'action';

      const action: ActionBlock = {
        id: `consumable-${ce.id}`,
        name: `${eq.name} (${effect.label})`,
        timing,
        source: 'consumable',
        sourceLabel: 'Item Consumivel',
        description: `Usar ${eq.name}: ${effect.label}. Quantidade: ${ce.quantity}.`,
        uses: ce.quantity,
        usesMax: ce.quantity,
      };

      if (effect.dice) {
        action.damage = {
          dice: effect.dice,
          type: effect.damageType ?? (effect.type === 'healing' ? 'Healing' : 'Unknown'),
        };
      }

      if (effect.range) {
        action.range = `${effect.range} ft`;
      }

      out.push(action);
    }
  }

  // ---- Feature actions ----

  private buildFeatureActions(
    charFeatures: CharacterFeatureEntity[],
    charClasses: CharacterClassEntity[],
    charState: CharacterStateEntity | null,
    profBonus: number,
    mod: (s: string) => number,
    out: ActionBlock[],
  ) {
    const classMap = new Map(charClasses.map((cc) => [cc.class_id, cc]));

    // Feature-to-action mapping for known class features
    const featureActionMap = this.getFeatureActionDefinitions(profBonus, mod, charClasses);

    for (const cf of charFeatures) {
      if (!cf.active || !cf.feature) continue;

      const slug = cf.feature.slug;
      const mapped = featureActionMap.get(slug);

      if (mapped) {
        // Use known mapping
        for (const actionDef of mapped) {
          out.push({
            ...actionDef,
            id: `feature-${cf.id}-${actionDef.id}`,
            // Spec 011 Phase 3 — preserva slug canônico pro dispatcher.
            featureSlug: actionDef.id,
          });
        }
        continue;
      }

      // For unknown features, include them as informational if they have description
      const desc = cf.feature.description;
      const descText = Array.isArray(desc) ? desc[0] : typeof desc === 'string' ? desc : '';

      if (descText && typeof descText === 'string') {
        // Skip passive features (no action verb)
        const isAction = /action|bonus action|reaction|use|activate|expend/i.test(descText);
        if (!isAction) continue;

        let timing: ActionTiming = 'action';
        if (/bonus action/i.test(descText)) timing = 'bonus_action';
        else if (/reaction/i.test(descText)) timing = 'reaction';

        const shortDesc = descText.length > 150
          ? descText.substring(0, 147) + '...'
          : descText;

        out.push({
          id: `feature-${cf.id}`,
          name: cf.feature.name,
          timing,
          source: 'feature',
          sourceLabel: (cf.source_class_id ? classMap.get(cf.source_class_id)?.class.name : undefined) ?? 'Classe',
          description: shortDesc,
          // Unknown feature — slug vem direto do catálogo SRD.
          featureSlug: slug,
        });
      }
    }
  }

  // ---- Race trait actions ----

  // Draconic ancestry map moved to shared srd-utils.ts

  private buildRaceTraitActions(
    character: CharacterEntity,
    totalLevel: number,
    profBonus: number,
    mod: (s: string) => number,
    out: ActionBlock[],
  ) {
    const origin = character.character_origin;
    if (!origin) return;

    const raceSlug = origin.race?.slug ?? '';
    if (raceSlug !== 'dragonborn') return;

    const traitChoices: string[] = origin.race_trait_choices ?? [];
    const dragonColor = traitChoices.find((c) => DRACONIC_ANCESTRY_MAP[c]);
    if (!dragonColor) return;

    const damageType = DRACONIC_ANCESTRY_MAP[dragonColor].damageType;
    const damageDice = totalLevel >= 17 ? '4d10'
      : totalLevel >= 11 ? '3d10'
      : totalLevel >= 5 ? '2d10'
      : '1d10';
    const saveDc = 8 + mod('con') + profBonus;
    const uses = profBonus;

    const dragonName = dragonColor.charAt(0).toUpperCase() + dragonColor.slice(1);

    out.push({
      id: 'breath-weapon',
      name: `Sopro de Dragao (${dragonName})`,
      timing: 'action',
      source: 'feature',
      sourceLabel: 'Dragonborn',
      description: `Exala ${damageType} em cone de 15 ft ou linha de 30x5 ft. Cada criatura na area faz save de DES (DC ${saveDc}). Falha: ${damageDice} dano ${damageType}. Sucesso: metade. ${uses} usos por descanso longo.`,
      damage: { dice: damageDice, type: damageType },
      saveDc,
      saveAbility: 'DES',
      range: '15 ft cone / 30 ft line',
      uses,
      usesMax: uses,
      usesRecharge: 'long_rest',
    });
  }

  // ---- Feature action definitions ----

  private getFeatureActionDefinitions(
    profBonus: number,
    mod: (s: string) => number,
    charClasses: CharacterClassEntity[],
  ): Map<string, ActionBlock[]> {
    const map = new Map<string, ActionBlock[]>();
    const conMod = mod('con');
    const strMod = mod('str');
    const wisMod = mod('wis');
    const chaMod = mod('cha');

    // Fighter
    const fighterClass = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'fighter');
    if (fighterClass) {
      map.set('second-wind', [{
        id: 'second-wind',
        name: 'Retomar Folego (Second Wind)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Guerreiro',
        description: `Recupera 1d10+${fighterClass.class_level} HP. 1 uso por descanso curto/longo.`,
        damage: { dice: `1d10+${fighterClass.class_level}`, type: 'Healing' },
        uses: 1,
        usesMax: 1,
        usesRecharge: 'short_rest',
      }]);

      map.set('action-surge', [{
        id: 'action-surge',
        name: 'Surto de Acao (Action Surge)',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Guerreiro',
        description: 'Ganha uma acao adicional neste turno. 1 uso por descanso curto/longo.',
        uses: fighterClass.class_level >= 17 ? 2 : 1,
        usesMax: fighterClass.class_level >= 17 ? 2 : 1,
        usesRecharge: 'short_rest',
      }]);
    }

    // Barbarian
    const barbarianClass = charClasses.find((cc) => cc.class.slug === 'barbarian');
    if (barbarianClass) {
      const rages = barbarianClass.class_level >= 17 ? 6
        : barbarianClass.class_level >= 12 ? 5
        : barbarianClass.class_level >= 6 ? 4
        : barbarianClass.class_level >= 3 ? 3
        : 2;
      const rageDmg = barbarianClass.class_level >= 16 ? 4
        : barbarianClass.class_level >= 9 ? 3
        : 2;

      map.set('rage', [{
        id: 'rage',
        name: 'Furia (Rage)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Barbaro',
        description: `Entra em furia. +${rageDmg} dano melee com FOR, resistencia a dano de concussao/perfuracao/cortante, vantagem em testes de FOR. ${rages} usos por descanso longo.`,
        uses: rages,
        usesMax: rages,
        usesRecharge: 'long_rest',
      }]);

      map.set('reckless-attack', [{
        id: 'reckless-attack',
        name: 'Ataque Imprudente (Reckless Attack)',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Barbaro',
        description: 'No primeiro ataque do turno com FOR: Vantagem no ataque, porem ataques contra voce tem Vantagem ate o proximo turno.',
      }]);
    }

    // Rogue
    const rogueClass = charClasses.find((cc) => cc.class.slug === 'rogue');
    if (rogueClass) {
      const sneakDice = Math.ceil(rogueClass.class_level / 2);
      map.set('sneak-attack', [{
        id: 'sneak-attack',
        name: 'Ataque Furtivo (Sneak Attack)',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Ladino',
        description: `${sneakDice}d6 dano extra com arma Finesse/Distancia quando tem Vantagem ou aliado a 5 ft do alvo. 1x por turno.`,
        damage: { dice: `${sneakDice}d6`, type: 'Extra' },
      }]);

      map.set('cunning-action', [{
        id: 'cunning-action-dash',
        name: 'Acao Ardilosa: Disparada',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Ladino',
        description: 'Usa Disparada como acao bonus.',
      }, {
        id: 'cunning-action-disengage',
        name: 'Acao Ardilosa: Retirada',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Ladino',
        description: 'Usa Retirada como acao bonus.',
      }, {
        id: 'cunning-action-hide',
        name: 'Acao Ardilosa: Esconder',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Ladino',
        description: 'Usa Esconder como acao bonus.',
      }]);
    }

    // Monk
    const monkClass = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'monk');
    if (monkClass) {
      const kiPoints = monkClass.class_level;
      map.set('flurry-of-blows', [{
        id: 'flurry-of-blows',
        name: 'Rajada de Golpes (Flurry of Blows)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Monge',
        description: `Gasta 1 ponto de Ki para fazer 2 ataques desarmados como acao bonus. ${kiPoints} pontos de Ki por descanso curto/longo.`,
        uses: kiPoints,
        usesMax: kiPoints,
        usesRecharge: 'short_rest',
      }]);

      map.set('patient-defense', [{
        id: 'patient-defense',
        name: 'Defesa Paciente (Patient Defense)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Monge',
        description: 'Gasta 1 ponto de Ki para usar Esquivar como acao bonus.',
        uses: kiPoints,
        usesMax: kiPoints,
        usesRecharge: 'short_rest',
      }]);

      map.set('step-of-the-wind', [{
        id: 'step-of-the-wind',
        name: 'Passo do Vento (Step of the Wind)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Monge',
        description: 'Gasta 1 ponto de Ki para usar Disparada ou Retirada como acao bonus, e distancia de salto dobra neste turno.',
        uses: kiPoints,
        usesMax: kiPoints,
        usesRecharge: 'short_rest',
      }]);

      // Monks can make a bonus action unarmed strike
      map.set('martial-arts', [{
        id: 'martial-arts-bonus',
        name: 'Artes Marciais: Ataque Bonus',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Monge',
        description: 'Apos usar a acao de Ataque com arma de monge ou ataque desarmado, faz um ataque desarmado como acao bonus.',
      }]);
    }

    // Cleric
    const clericClass = charClasses.find((cc) => cc.class.slug === 'cleric');
    if (clericClass) {
      map.set('channel-divinity', [{
        id: 'channel-divinity',
        name: 'Canalizar Divindade (Channel Divinity)',
        timing: 'action',
        source: 'feature',
        sourceLabel: 'Clerigo',
        description: `Usa seu poder divino canalizado. ${clericClass.class_level >= 6 ? 2 : 1} uso(s) por descanso curto/longo.`,
        uses: clericClass.class_level >= 6 ? 2 : 1,
        usesMax: clericClass.class_level >= 6 ? 2 : 1,
        usesRecharge: 'short_rest',
      }]);
    }

    // Paladin
    const paladinClass = charClasses.find((cc) => cc.class.slug === 'paladin');
    if (paladinClass) {
      map.set('divine-smite', [{
        id: 'divine-smite',
        name: 'Destruicao Divina (Divine Smite)',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Paladino',
        description: 'Ao acertar com ataque melee, gasta 1 spell slot para causar 2d8 dano radiante extra (+1d8 por nivel de slot acima do 1o, max 5d8, +1d8 vs mortos-vivos/fadas).',
        damage: { dice: '2d8', type: 'Radiant' },
      }]);

      map.set('lay-on-hands', [{
        id: 'lay-on-hands',
        name: 'Imposicao de Maos (Lay on Hands)',
        timing: 'action',
        source: 'feature',
        sourceLabel: 'Paladino',
        description: `Pool de cura: ${paladinClass.class_level * 5} HP. Toque para curar ou gastar 5 para curar doenca/veneno.`,
        damage: { dice: `${paladinClass.class_level * 5}`, type: 'Healing' },
        uses: paladinClass.class_level * 5,
        usesMax: paladinClass.class_level * 5,
        usesRecharge: 'long_rest',
      }]);
    }

    // Druid
    const druidClass = charClasses.find((cc) => cc.class.slug === 'druid');
    if (druidClass && druidClass.class_level >= 2) {
      map.set('wild-shape', [{
        id: 'wild-shape',
        name: 'Forma Selvagem (Wild Shape)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Druida',
        description: `Transforma-se em uma besta. ${druidClass.class_level >= 20 ? 'Usos ilimitados' : '2 usos'} por descanso curto/longo.`,
        uses: druidClass.class_level >= 20 ? 999 : 2,
        usesMax: druidClass.class_level >= 20 ? 999 : 2,
        usesRecharge: 'short_rest',
      }]);
    }

    // Sorcerer
    const sorcererClass = charClasses.find((cc) => cc.class.slug === 'sorcerer');
    if (sorcererClass) {
      map.set('font-of-magic', [{
        id: 'font-of-magic',
        name: 'Fonte de Magia (Font of Magic)',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Feiticeiro',
        description: `${sorcererClass.class_level} pontos de feiticaria. Converte spell slots em pontos ou pontos em slots.`,
        uses: sorcererClass.class_level,
        usesMax: sorcererClass.class_level,
        usesRecharge: 'long_rest',
      }]);
    }

    // Warlock
    const warlockClass = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'warlock');
    if (warlockClass) {
      map.set('eldritch-invocations', [{
        id: 'eldritch-invocations',
        name: 'Invocacoes Misticas',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Bruxo',
        description: 'Suas invocacoes misticas concedem habilidades passivas e ativas. Verifique suas invocacoes para detalhes.',
      }]);
    }

    // Wizard
    const wizardClass = charClasses.find((cc) => cc.class.slug === 'wizard');
    if (wizardClass && wizardClass.class_level >= 2) {
      map.set('arcane-recovery', [{
        id: 'arcane-recovery',
        name: 'Recuperacao Arcana (Arcane Recovery)',
        timing: 'action',
        source: 'feature',
        sourceLabel: 'Mago',
        description: `Uma vez por dia durante descanso curto, recupera spell slots com niveis que somam ate ${Math.ceil(wizardClass.class_level / 2)} (nenhum 6o nivel ou acima).`,
        uses: 1,
        usesMax: 1,
        usesRecharge: 'long_rest',
      }]);
    }

    // Bard
    const bardClass = charClasses.find((cc) => cc.class.slug === 'bard');
    if (bardClass) {
      const inspirationDie = bardClass.class_level >= 15 ? 'd12'
        : bardClass.class_level >= 10 ? 'd10'
        : bardClass.class_level >= 5 ? 'd8'
        : 'd6';
      const uses = Math.max(1, chaMod);

      map.set('bardic-inspiration', [{
        id: 'bardic-inspiration',
        name: 'Inspiracao Bardica',
        timing: 'bonus_action',
        source: 'feature',
        sourceLabel: 'Bardo',
        description: `Da um ${inspirationDie} de Inspiracao Bardica a um aliado a 60 ft. ${uses} uso(s) por descanso ${bardClass.class_level >= 5 ? 'curto' : 'longo'}.`,
        uses,
        usesMax: uses,
        usesRecharge: bardClass.class_level >= 5 ? 'short_rest' : 'long_rest',
      }]);
    }

    // Ranger
    const rangerClass = charClasses.find((cc) => cc.class.slug === 'ranger');
    if (rangerClass && rangerClass.class_level >= 3) {
      map.set('dreadful-strikes', [{
        id: 'dreadful-strikes',
        name: 'Golpes Pavorosos',
        timing: 'free',
        source: 'feature',
        sourceLabel: 'Patrulheiro',
        description: `1x por turno ao acertar ataque com arma: +1d${rangerClass.class_level >= 11 ? '8' : '6'} dano psiquico extra.`,
      }]);
    }

    return map;
  }

  // ---- Helpers ----

  private parseVersatileDice(text: string | undefined, baseDice: string): string {
    if (!text) {
      // Default: upgrade die by one step
      const match = baseDice.match(/(\d+)d(\d+)/);
      if (!match) return baseDice;
      const dieSize = parseInt(match[2], 10);
      const nextDie = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 12 }[dieSize] ?? dieSize;
      return `${match[1]}d${nextDie}`;
    }
    // Try to extract dice from the text, e.g. "(1d10)"
    const diceMatch = text.match(/(\d+d\d+)/);
    return diceMatch ? diceMatch[1] : this.parseVersatileDice(undefined, baseDice);
  }

  private getCantripDamage(table: Record<string, string>, totalLevel: number): string {
    const levels = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b);

    let dice = '';
    for (const lvl of levels) {
      if (totalLevel >= lvl) {
        dice = table[String(lvl)];
      }
    }
    return dice;
  }
}
