import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterStateEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterLevelUpEntity,
} from 'src/entities';
import { XP_THRESHOLDS, normalizeClassSlug } from 'src/shared/srd-constants';
import { getAbilityModifier } from 'src/shared/srd-utils';
import { ensureCharacterOwnership, getCharacterState } from 'src/shared/character-guard';

export interface HpUpdateDto {
  damage?: number;
  healing?: number;
  tempHp?: number;
}

export interface XpUpdateDto {
  amount: number;
}

export interface DeathSaveDto {
  success?: boolean;
  fail?: boolean;
  reset?: boolean;
  /** If provided, handles natural 20 (regain 1 HP + reset) and natural 1 (2 failures) */
  rollValue?: number;
  /** Direct delta for failures — used when taking damage at 0 HP (1, or 2 on critical hit). */
  failuresDelta?: number;
}

export interface KiPointsDto {
  used: number;
}

export interface ConditionsDto {
  conditions: string[];
}

export interface ExhaustionDto {
  level: number;
}

export interface InspirationDto {
  inspiration: boolean;
}

export interface HpResult {
  currentHp: number;
  tempHp: number;
  maxHp: number;
  isDown: boolean;
  instantDeath: boolean;
  deathSaves: { successes: number; failures: number };
}

export interface XpResult {
  xp: number;
  currentLevel: number;
  nextLevelXp: number | null;
  levelUpAvailable: boolean;
}

export interface DeathSaveResult {
  successes: number;
  failures: number;
  stabilized: boolean;
  dead: boolean;
  revivedHp?: number;
}

@Injectable()
export class CharacterStateService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterLevelUpEntity)
    private readonly charLevelUpRepo: Repository<CharacterLevelUpEntity>,
  ) {}

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterOwnership(this.characterRepo, userId, characterId);
  }

  private async getState(characterId: string): Promise<CharacterStateEntity> {
    return getCharacterState(this.stateRepo, characterId);
  }

  /**
   * Spec 003 — retorna o record `feature_uses_used` do PC (vazio se state não existe).
   * Usado pelo CombatActionRegistry para decidir `available` de class features.
   */
  async getFeatureUsesUsed(
    characterId: string,
  ): Promise<Record<string, number>> {
    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    return state?.feature_uses_used ?? {};
  }

  /**
   * Spec 003 — incrementa usos consumidos de uma feature. Usado pelo executor.
   * Se delta for HP gasto (ex: lay-on-hands), passar delta variável.
   */
  async incrementFeatureUses(
    characterId: string,
    featureSlug: string,
    delta = 1,
  ): Promise<number> {
    const state = await this.getState(characterId);
    const current = state.feature_uses_used?.[featureSlug] ?? 0;
    const next = current + delta;
    state.feature_uses_used = {
      ...(state.feature_uses_used ?? {}),
      [featureSlug]: next,
    };
    await this.stateRepo.save(state);
    return next;
  }

  private async computeMaxHp(characterId: string): Promise<number> {
    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
      order: { order: 'ASC' },
    });
    const primaryClass = charClasses[0];
    if (!primaryClass) return 10;

    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });
    const conAbility = charAbilities.find(
      (a) => a.ability_score.slug === 'con',
    );
    const conMod = conAbility
      ? getAbilityModifier(conAbility.base_score + conAbility.bonus)
      : 0;

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

  async updateHp(
    userId: string,
    characterId: string,
    dto: HpUpdateDto,
  ): Promise<HpResult> {
    await this.ensureOwnership(userId, characterId);

    if (dto.damage !== undefined && dto.damage < 0) {
      throw new BadRequestException('Dano deve ser um valor positivo.');
    }
    if (dto.healing !== undefined && dto.healing < 0) {
      throw new BadRequestException('Cura deve ser um valor positivo.');
    }
    if (dto.tempHp !== undefined && dto.tempHp < 0) {
      throw new BadRequestException(
        'HP temporario deve ser um valor positivo.',
      );
    }

    const state = await this.getState(characterId);
    const maxHp = await this.computeMaxHp(characterId);

    let instantDeath = false;

    // Apply temp HP update
    if (dto.tempHp !== undefined) {
      state.temp_hp = dto.tempHp;
    }

    // Apply damage: temp HP absorbs first
    if (dto.damage !== undefined && dto.damage > 0) {
      let remaining = dto.damage;

      if (state.temp_hp > 0) {
        const absorbed = Math.min(state.temp_hp, remaining);
        state.temp_hp -= absorbed;
        remaining -= absorbed;
      }

      const hpBeforeDamage = state.current_hp;
      state.current_hp = Math.max(0, state.current_hp - remaining);

      // Massive damage: if excess damage after reaching 0 HP >= maxHp, instant death
      if (state.current_hp === 0 && remaining > hpBeforeDamage) {
        const excessDamage = remaining - hpBeforeDamage;
        if (excessDamage >= maxHp) {
          instantDeath = true;
        }
      }
    }

    // Apply healing (cap at max HP, only if alive)
    if (dto.healing !== undefined && dto.healing > 0) {
      state.current_hp = Math.min(maxHp, state.current_hp + dto.healing);
      // Revived from 0: reset death saves
      if (state.current_hp > 0) {
        state.death_saves_success = 0;
        state.death_saves_fail = 0;
      }
    }

    await this.stateRepo.save(state);

    const isDown = state.current_hp === 0 && !instantDeath;

    return {
      currentHp: state.current_hp,
      tempHp: state.temp_hp,
      maxHp,
      isDown,
      instantDeath,
      deathSaves: {
        successes: state.death_saves_success,
        failures: state.death_saves_fail,
      },
    };
  }

  async updateXp(
    userId: string,
    characterId: string,
    dto: XpUpdateDto,
  ): Promise<XpResult> {
    await this.ensureOwnership(userId, characterId);

    if (dto.amount < 0) {
      throw new BadRequestException('Quantidade de XP deve ser positiva.');
    }

    const state = await this.getState(characterId);
    state.xp += dto.amount;
    await this.stateRepo.save(state);

    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
    });
    const totalLevel = charClasses.reduce((sum, cc) => sum + cc.class_level, 0);

    const nextLevelXp = totalLevel < 20 ? XP_THRESHOLDS[totalLevel] : null;
    const levelUpAvailable = nextLevelXp !== null && state.xp >= nextLevelXp;

    return {
      xp: state.xp,
      currentLevel: totalLevel,
      nextLevelXp,
      levelUpAvailable,
    };
  }

  async updateDeathSaves(
    userId: string,
    characterId: string,
    dto: DeathSaveDto,
  ): Promise<DeathSaveResult> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);

    let revivedHp: number | undefined;

    if (dto.reset) {
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
    } else if (dto.failuresDelta !== undefined && dto.failuresDelta > 0) {
      state.death_saves_fail = Math.min(3, state.death_saves_fail + dto.failuresDelta);
    } else if (dto.rollValue === 20) {
      // Natural 20: regain 1 HP, reset all death saves, regain consciousness
      state.current_hp = 1;
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
      revivedHp = 1;
    } else if (dto.rollValue === 1) {
      // Natural 1: counts as 2 failures
      state.death_saves_fail = Math.min(3, state.death_saves_fail + 2);
    } else {
      if (dto.success || (dto.rollValue !== undefined && dto.rollValue >= 10)) {
        state.death_saves_success = Math.min(3, state.death_saves_success + 1);
      }
      if (dto.fail || (dto.rollValue !== undefined && dto.rollValue < 10 && dto.rollValue > 1)) {
        state.death_saves_fail = Math.min(3, state.death_saves_fail + 1);
      }
    }

    await this.stateRepo.save(state);

    return {
      successes: state.death_saves_success,
      failures: state.death_saves_fail,
      stabilized: state.death_saves_success >= 3,
      dead: state.death_saves_fail >= 3,
      ...(revivedHp !== undefined && { revivedHp }),
    };
  }

  async updateKiPoints(
    userId: string,
    characterId: string,
    dto: KiPointsDto,
  ): Promise<{ total: number; used: number }> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);

    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
    });
    const monk = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'monk');
    if (!monk || monk.class_level < 2) {
      throw new BadRequestException('Personagem nao possui pontos de Ki.');
    }

    const total = monk.class_level;
    const used = Math.max(0, Math.min(dto.used, total));
    state.ki_points_used = used;
    await this.stateRepo.save(state);

    return { total, used };
  }

  // ---- Conditions ----

  async updateConditions(
    userId: string,
    characterId: string,
    dto: ConditionsDto,
  ): Promise<{ conditions: string[] }> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);
    state.conditions = dto.conditions;
    await this.stateRepo.save(state);
    return { conditions: state.conditions };
  }

  // ---- Exhaustion ----

  async updateExhaustion(
    userId: string,
    characterId: string,
    dto: ExhaustionDto,
  ): Promise<{ exhaustionLevel: number }> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);
    state.exhaustion_level = Math.max(0, Math.min(6, dto.level));
    await this.stateRepo.save(state);
    return { exhaustionLevel: state.exhaustion_level };
  }

  // ---- Inspiration ----

  async updateInspiration(
    userId: string,
    characterId: string,
    dto: InspirationDto,
  ): Promise<{ inspiration: boolean }> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);
    state.inspiration = dto.inspiration;
    await this.stateRepo.save(state);
    return { inspiration: state.inspiration };
  }

  /**
   * Spec 012 — Heroic Inspiration: set inspiration sem owner-check. Usado
   * pelo DM via encounter-service (DM já teve permissão validada na rota
   * de encounter). Retorna `{ inspiration }` atualizado.
   */
  async setInspiration(
    characterId: string,
    value: boolean,
  ): Promise<{ inspiration: boolean }> {
    const state = await this.getState(characterId);
    state.inspiration = value;
    await this.stateRepo.save(state);
    return { inspiration: state.inspiration };
  }

  /** Spec 012 — leitura pública (read-only, sem owner check). */
  async getInspiration(characterId: string): Promise<boolean> {
    const state = await this.getState(characterId);
    return state.inspiration;
  }

  /** Returns XP threshold info for a given total level */
  static getXpInfo(
    xp: number,
    totalLevel: number,
  ): { nextLevelXp: number | null; levelUpAvailable: boolean } {
    const nextLevelXp = totalLevel < 20 ? XP_THRESHOLDS[totalLevel] : null;
    return {
      nextLevelXp,
      levelUpAvailable: nextLevelXp !== null && xp >= nextLevelXp,
    };
  }
}
