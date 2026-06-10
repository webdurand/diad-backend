import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterStateEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterLevelUpEntity,
  CampaignPartyMemberEntity,
} from "src/entities";
import { XP_THRESHOLDS, normalizeClassSlug } from "src/shared/srd-constants";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  ensureCharacterWriteAccess,
  getCharacterState,
} from "src/shared/character-guard";

export interface HpUpdateDto {
  damage?: number;
  healing?: number;
  tempHp?: number;

  nonlethal?: boolean;
}

export interface XpUpdateDto {
  amount: number;
}

export interface DeathSaveDto {
  success?: boolean;
  fail?: boolean;
  reset?: boolean;

  rollValue?: number;

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

  knockedOut?: boolean;
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
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
  ) {}

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterWriteAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
    );
  }

  private async getState(characterId: string): Promise<CharacterStateEntity> {
    return getCharacterState(this.stateRepo, characterId);
  }

  // A ficha (character_state) é o que o front recarrega após o turno — é ela
  // que decide abrir a Fate Ladder (currentHp<=0 && failures>=3). Os caminhos
  // de morte precisam manter conditions/'dying'/'dead' coerentes na ficha.
  private syncConditions(
    state: CharacterStateEntity,
    add: string[],
    remove: string[],
  ): void {
    const next = new Set(state.conditions ?? []);
    for (const c of remove) next.delete(c);
    for (const c of add) next.add(c);
    state.conditions = Array.from(next);
  }


  async getFeatureUsesUsed(
    characterId: string,
  ): Promise<Record<string, number>> {
    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    return state?.feature_uses_used ?? {};
  }


  async getCurrentHp(characterId: string): Promise<number | null> {
    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    return state?.current_hp ?? null;
  }


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

  // Contexto mínimo para curas de descanso fora do fluxo updateHp (spec 049:
  // camp em viagem cura HP de verdade — HD spent = roll + CON mod; long = full).
  async getRestHealingContext(
    characterId: string,
  ): Promise<{ maxHp: number; conMod: number }> {
    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });
    const conAbility = charAbilities.find(
      (a) => a.ability_score.slug === "con",
    );
    const conMod = conAbility
      ? getAbilityModifier(conAbility.base_score + conAbility.bonus)
      : 0;
    const maxHp = await this.computeMaxHp(characterId);
    return { maxHp, conMod };
  }

  private async computeMaxHp(characterId: string): Promise<number> {
    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
      order: { order: "ASC" },
    });
    const primaryClass = charClasses[0];
    if (!primaryClass) return 10;

    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });
    const conAbility = charAbilities.find(
      (a) => a.ability_score.slug === "con",
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
      throw new BadRequestException("Dano deve ser um valor positivo.");
    }
    if (dto.healing !== undefined && dto.healing < 0) {
      throw new BadRequestException("Cura deve ser um valor positivo.");
    }
    if (dto.tempHp !== undefined && dto.tempHp < 0) {
      throw new BadRequestException(
        "HP temporario deve ser um valor positivo.",
      );
    }

    const state = await this.getState(characterId);
    const maxHp = await this.computeMaxHp(characterId);

    let instantDeath = false;
    let knockedOut = false;


    if (dto.tempHp !== undefined) {
      state.temp_hp = dto.tempHp;
    }


    if (dto.damage !== undefined && dto.damage > 0) {
      let remaining = dto.damage;

      if (state.temp_hp > 0) {
        const absorbed = Math.min(state.temp_hp, remaining);
        state.temp_hp -= absorbed;
        remaining -= absorbed;
      }

      const hpBeforeDamage = state.current_hp;



      if (dto.nonlethal && remaining >= hpBeforeDamage && hpBeforeDamage > 0) {
        state.current_hp = 1;
        knockedOut = true;
        const conds = Array.isArray(state.conditions) ? state.conditions : [];
        if (!conds.includes("unconscious")) {
          state.conditions = [...conds, "unconscious"];
        }
      } else {
        state.current_hp = Math.max(0, state.current_hp - remaining);


        if (state.current_hp === 0 && remaining > hpBeforeDamage) {
          const excessDamage = remaining - hpBeforeDamage;
          if (excessDamage >= maxHp) {
            instantDeath = true;
          }
        }

        // Morte em limbo (avaliação 2026-06): a ficha precisa refletir o
        // estado do encounter. Instant death persiste 3 falhas + 'dead'
        // (o front só abre a Fate Ladder com hp<=0 && failures>=3);
        // cair a 0 HP marca 'dying' na ficha, não só no participant.
        if (state.current_hp === 0) {
          if (instantDeath) {
            state.death_saves_fail = 3;
            this.syncConditions(state, ["dead"], ["dying"]);
          } else if (!(state.conditions ?? []).includes("dead")) {
            this.syncConditions(state, ["dying"], []);
          }
        }
      }
    }


    if (dto.healing !== undefined && dto.healing > 0) {
      state.current_hp = Math.min(maxHp, state.current_hp + dto.healing);

      if (state.current_hp > 0) {
        state.death_saves_success = 0;
        state.death_saves_fail = 0;
        // HP > 0 ⇒ não está mais morrendo ('dead' só sai via revive explícito).
        this.syncConditions(state, [], ["dying"]);
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
      knockedOut,
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
      throw new BadRequestException("Quantidade de XP deve ser positiva.");
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
      state.death_saves_fail = Math.min(
        3,
        state.death_saves_fail + dto.failuresDelta,
      );
    } else if (dto.rollValue === 20) {

      state.current_hp = 1;
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
      revivedHp = 1;
    } else if (dto.rollValue === 1) {

      state.death_saves_fail = Math.min(3, state.death_saves_fail + 2);
    } else {
      if (dto.success || (dto.rollValue !== undefined && dto.rollValue >= 10)) {
        state.death_saves_success = Math.min(3, state.death_saves_success + 1);
      }
      if (
        dto.fail ||
        (dto.rollValue !== undefined && dto.rollValue < 10 && dto.rollValue > 1)
      ) {
        state.death_saves_fail = Math.min(3, state.death_saves_fail + 1);
      }
    }

    // Morte em limbo (avaliação 2026-06): death saves só existem a 0 HP, mas
    // o PC pode ter entrado em 'dying' por caminho que não passou pela ficha
    // (ex.: PATCH dying-state narrativo só escreve participant.dyingState).
    // Sincroniza aqui — current_hp=0 enquanto morre, e condição 'dying'/'dead'
    // conforme o caso — para a ficha recarregada disparar a Fate Ladder.
    if (!dto.reset) {
      if (revivedHp !== undefined) {
        this.syncConditions(state, [], ["dying", "unconscious"]);
      } else {
        if (state.current_hp > 0) {
          state.current_hp = 0;
        }
        if (state.death_saves_fail >= 3) {
          this.syncConditions(state, ["dead"], ["dying"]);
        } else if (state.death_saves_success >= 3) {
          this.syncConditions(state, ["unconscious"], ["dying"]);
        } else {
          this.syncConditions(state, ["dying"], []);
        }
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
    const monk = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "monk",
    );
    if (!monk || monk.class_level < 2) {
      throw new BadRequestException("Personagem nao possui pontos de Ki.");
    }

    const total = monk.class_level;
    const used = Math.max(0, Math.min(dto.used, total));
    state.ki_points_used = used;
    await this.stateRepo.save(state);

    return { total, used };
  }



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



  async updateExhaustion(
    userId: string,
    characterId: string,
    dto: ExhaustionDto,
  ): Promise<{ exhaustionLevel: number }> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);

    state.exhaustion_level = Math.max(0, Math.min(10, dto.level));
    await this.stateRepo.save(state);
    return { exhaustionLevel: state.exhaustion_level };
  }



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


  async setInspiration(
    characterId: string,
    value: boolean,
  ): Promise<{ inspiration: boolean }> {
    const state = await this.getState(characterId);
    state.inspiration = value;
    await this.stateRepo.save(state);
    return { inspiration: state.inspiration };
  }


  async getInspiration(characterId: string): Promise<boolean> {
    const state = await this.getState(characterId);
    return state.inspiration;
  }


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
