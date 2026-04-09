import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { ActionsService } from 'src/models/characters/services/actions.service';
import { DiceService } from './dice.service';
import { ConditionEffectsService } from './condition-effects.service';
import { EventService } from './event.service';
import { EncounterService } from './encounter.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';
import {
  AttackResult,
  TurnInfo,
  RoundInfo,
  ConcentrationCheckResult,
  DeathSaveResult,
} from '../interfaces/combat.interfaces';
import { getAbilityModifier } from 'src/shared/srd-utils';

// --- DTOs ---

export interface AttackDto {
  attackerParticipantId: string;
  targetParticipantId: string;
  /** Action name/id from ActionsService (for PCs) or monster action name */
  actionName: string;
  /** Manual override from DM */
  forceAdvantage?: boolean;
  forceDisadvantage?: boolean;
  /** UserId of the session owner (DM), needed for CharacterState delegation */
  ownerUserId: string;
}

export interface DamageDto {
  targetParticipantId: string;
  amount: number;
  damageType: string;
  ownerUserId: string;
}

export interface HealDto {
  targetParticipantId: string;
  amount: number;
  ownerUserId: string;
}

export interface ConditionDto {
  participantId: string;
  condition: string;
  apply: boolean;
  ownerUserId: string;
}

@Injectable()
export class CombatService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly encounterService: EncounterService,
    private readonly eventService: EventService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly actionsService: ActionsService,
  ) {}

  // --- Turn Management ---

  async getCurrentTurn(encounterId: string): Promise<GameResult<TurnInfo>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');
    if (encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const participantId = encounter.turnOrder[encounter.currentTurnIndex];
    if (!participantId) return failure('Sem participante no turno.', 'INVALID_PARTICIPANT');

    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) return failure('Participante nao encontrado.', 'PARTICIPANT_NOT_FOUND');

    return success({
      encounterId,
      round: encounter.currentRound,
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type as 'pc' | 'monster' | 'npc',
      isDefeated: participant.isDefeated,
    });
  }

  async endTurn(encounterId: string): Promise<GameResult<TurnInfo>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');
    if (encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const currentParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex];

    const events: GameEventData[] = [
      {
        event_type: 'turn_end',
        actor_participant_id: currentParticipantId,
        data: { round: encounter.currentRound },
      },
    ];

    // Reset reactions for current participant
    if (currentParticipantId) {
      await this.participantRepo.update(currentParticipantId, {
        reactionsUsed: 0,
      });
    }

    // Advance to next non-defeated participant
    let nextIndex = encounter.currentTurnIndex + 1;
    let newRound = encounter.currentRound;

    if (nextIndex >= encounter.turnOrder.length) {
      nextIndex = 0;
      newRound += 1;
      events.push({
        event_type: 'round_start',
        data: { round: newRound },
      });
    }

    // Skip defeated participants
    const totalParticipants = encounter.turnOrder.length;
    let skipped = 0;
    while (skipped < totalParticipants) {
      const pid = encounter.turnOrder[nextIndex];
      const p = await this.participantRepo.findOne({ where: { id: pid } });
      if (p && !p.isDefeated) break;
      nextIndex = (nextIndex + 1) % totalParticipants;
      if (nextIndex === 0) {
        newRound += 1;
      }
      skipped++;
    }

    encounter.currentTurnIndex = nextIndex;
    encounter.currentRound = newRound;
    await this.encounterRepo.save(encounter);

    const nextParticipantId = encounter.turnOrder[nextIndex];
    events.push({
      event_type: 'turn_start',
      actor_participant_id: nextParticipantId,
      data: { round: newRound },
    });

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    const nextP = await this.participantRepo.findOne({
      where: { id: nextParticipantId },
    });

    return success({
      encounterId,
      round: newRound,
      participantId: nextParticipantId,
      participantName: nextP?.displayName ?? '',
      participantType: (nextP?.type as 'pc' | 'monster' | 'npc') ?? 'monster',
      isDefeated: nextP?.isDefeated ?? false,
    });
  }

  // --- Attack Resolution ---

  async resolveAttack(
    encounterId: string,
    dto: AttackDto,
  ): Promise<GameResult<AttackResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const attacker = await this.encounterService.getParticipant(
      dto.attackerParticipantId,
    );
    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    if (attacker.isDefeated)
      return failure('Atacante esta derrotado.', 'CONDITION_PREVENTS_ACTION');
    if (target.isDefeated)
      return failure('Alvo ja esta derrotado.', 'TARGET_DEFEATED');

    // Check if attacker can act
    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure(
        'Atacante nao pode agir devido a condicoes.',
        'CONDITION_PREVENTS_ACTION',
      );

    // Get attack bonus and damage info
    let attackBonus = 0;
    let damageDice = '1d4';
    let damageType = 'bludgeoning';
    let damageBonus = 0;

    if (attacker.type === 'pc' && attacker.characterId) {
      const actions = await this.actionsService.getActions(
        dto.ownerUserId,
        attacker.characterId,
      );
      const allActions = [
        ...actions.actions,
        ...actions.bonusActions,
      ];
      const action = allActions.find(
        (a) =>
          a.name.toLowerCase() === dto.actionName.toLowerCase() ||
          a.id === dto.actionName,
      );
      if (!action)
        return failure(
          `Acao "${dto.actionName}" nao encontrada.`,
          'INVALID_ACTION',
        );
      attackBonus = action.attackBonus ?? 0;
      if (action.damage) {
        damageDice = action.damage.dice;
        damageType = action.damage.type;
        damageBonus = action.damage.bonus ?? 0;
      }
    } else if (attacker.type === 'monster' && attacker.monster) {
      const monsterActions = (attacker.monster.actions as unknown) as any[];
      const mAction = monsterActions?.find(
        (a: any) =>
          a.name?.toLowerCase() === dto.actionName.toLowerCase(),
      );
      if (mAction) {
        attackBonus = mAction.attack_bonus ?? 0;
        if (mAction.damage?.length > 0) {
          damageDice = mAction.damage[0].damage_dice ?? '1d4';
          damageType = mAction.damage[0].damage_type?.name ?? 'bludgeoning';
          damageBonus = 0; // monster damage_dice already includes bonus
        }
      }
    }

    // Determine advantage/disadvantage
    const attackerMods = this.conditionEffects.getAttackModifiers(
      attacker.conditions,
    );
    const defenderMods = this.conditionEffects.getDefenseModifiers(
      target.conditions,
    );

    let hasAdvantage =
      attackerMods.hasAdvantage ||
      defenderMods.attacksHaveAdvantage ||
      (dto.forceAdvantage ?? false);
    let hasDisadvantage =
      attackerMods.hasDisadvantage ||
      defenderMods.attacksHaveDisadvantage ||
      (dto.forceDisadvantage ?? false);

    // Advantage and disadvantage cancel out
    if (hasAdvantage && hasDisadvantage) {
      hasAdvantage = false;
      hasDisadvantage = false;
    }

    // Roll attack
    let attackRoll: number;
    let advantageResult: { roll1: number; roll2: number; chosen: number; discarded: number } | undefined;

    if (hasAdvantage) {
      const adv = this.diceService.rollWithAdvantage();
      attackRoll = adv.chosen;
      advantageResult = adv;
    } else if (hasDisadvantage) {
      const dis = this.diceService.rollWithDisadvantage();
      attackRoll = dis.chosen;
      advantageResult = dis;
    } else {
      attackRoll = this.diceService.roll(20);
    }

    const isCritical = attackRoll === 20;
    const isCriticalMiss = attackRoll === 1;

    // Get target AC
    let targetAc = 10;
    if (target.type === 'pc' && target.characterId) {
      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        target.characterId,
      );
      targetAc = sheet.armorClass;
    } else if (target.type === 'monster' && target.monster) {
      const ac = target.monster.armor_class as any;
      targetAc =
        (Array.isArray(ac) ? ac[0]?.value : ac?.value) ?? 10;
    }

    const totalAttack = attackRoll + attackBonus;
    const hit =
      !isCriticalMiss &&
      (isCritical ||
        defenderMods.autoCritIfMelee ||
        totalAttack >= targetAc);

    const events: GameEventData[] = [];

    const attackRollResult = {
      roll: attackRoll,
      modifier: attackBonus,
      total: totalAttack,
      targetAc,
      hit,
      critical: isCritical || defenderMods.autoCritIfMelee,
      criticalMiss: isCriticalMiss,
      advantage: advantageResult,
    };

    events.push({
      event_type: 'attack_roll',
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        actionName: dto.actionName,
        ...attackRollResult,
      },
    });

    let damageRollResult;
    let targetHpAfter: number | undefined;
    let targetDefeated = false;
    let concentrationBroken: boolean | undefined;

    if (hit) {
      // Roll damage
      const dmgResult = this.diceService.rollExpression(damageDice);
      let totalDamage = dmgResult.total + damageBonus;

      // Critical: double the dice (roll again), keep flat bonus once
      if (isCritical || defenderMods.autoCritIfMelee) {
        const critExtra = this.diceService.rollExpression(damageDice);
        totalDamage += critExtra.total;
      }

      // Check monster immunities/resistances/vulnerabilities
      let resisted = false;
      let immune = false;
      let vulnerable = false;
      let finalDamage = totalDamage;

      if (target.type === 'monster' && target.monster) {
        const immunities =
          ((target.monster.damage_immunities as unknown) as string[]) ?? [];
        const resistances =
          ((target.monster.damage_resistances as unknown) as string[]) ?? [];
        const vulnerabilities =
          ((target.monster.damage_vulnerabilities as unknown) as string[]) ?? [];

        const dtLower = damageType.toLowerCase();
        if (immunities.some((i) => i.toLowerCase().includes(dtLower))) {
          immune = true;
          finalDamage = 0;
        } else if (
          resistances.some((r) => r.toLowerCase().includes(dtLower))
        ) {
          resisted = true;
          finalDamage = Math.floor(totalDamage / 2);
        } else if (
          vulnerabilities.some((v) => v.toLowerCase().includes(dtLower))
        ) {
          vulnerable = true;
          finalDamage = totalDamage * 2;
        }
      }

      damageRollResult = {
        rolls: [dmgResult],
        bonus: damageBonus,
        total: totalDamage,
        type: damageType,
        resisted,
        immune,
        vulnerable,
        finalDamage,
      };

      events.push({
        event_type: 'damage_applied',
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          ...damageRollResult,
          critical: isCritical || defenderMods.autoCritIfMelee,
        },
      });

      // Apply damage
      if (target.type === 'pc' && target.characterId) {
        const hpResult = await this.stateService.updateHp(
          dto.ownerUserId,
          target.characterId,
          { damage: finalDamage },
        );
        targetHpAfter = hpResult.currentHp;
        targetDefeated = hpResult.isDown;
        if (targetDefeated) {
          target.isDefeated = true;
          await this.participantRepo.save(target);
        }
      } else {
        // Monster: apply directly
        const result = this.applyDamageToMonster(target, finalDamage);
        targetHpAfter = result.hpAfter;
        targetDefeated = result.defeated;
        await this.participantRepo.save(target);
      }

      // Concentration check
      if (target.isConcentrating && finalDamage > 0 && !targetDefeated) {
        const concResult = await this.concentrationCheck(
          target,
          finalDamage,
        );
        concentrationBroken = !concResult.maintained;
        events.push({
          event_type: 'concentration_check',
          target_participant_id: target.id,
          data: concResult,
        });
      }

      if (targetDefeated) {
        // Break concentration if defeated
        if (target.isConcentrating) {
          target.isConcentrating = false;
          target.concentratingOn = undefined;
          await this.participantRepo.save(target);
        }
      }
    }

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success(
      {
        attackRoll: attackRollResult,
        damageRoll: damageRollResult,
        targetHpAfter,
        targetDefeated,
        concentrationBroken,
      },
      events,
    );
  }

  // --- Arbitrary Damage/Heal ---

  async applyDamage(
    encounterId: string,
    dto: DamageDto,
  ): Promise<GameResult<{ hpAfter: number; defeated: boolean }>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    let hpAfter: number;
    let defeated: boolean;

    if (target.type === 'pc' && target.characterId) {
      const result = await this.stateService.updateHp(
        dto.ownerUserId,
        target.characterId,
        { damage: dto.amount },
      );
      hpAfter = result.currentHp;
      defeated = result.isDown;
      if (defeated) {
        target.isDefeated = true;
        await this.participantRepo.save(target);
      }
    } else {
      const result = this.applyDamageToMonster(target, dto.amount);
      hpAfter = result.hpAfter;
      defeated = result.defeated;
      await this.participantRepo.save(target);
    }

    const events: GameEventData[] = [
      {
        event_type: 'hp_change',
        target_participant_id: target.id,
        data: { damage: dto.amount, type: dto.damageType, hpAfter, defeated },
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ hpAfter, defeated }, events);
  }

  async applyHealing(
    encounterId: string,
    dto: HealDto,
  ): Promise<GameResult<{ hpAfter: number }>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    let hpAfter: number;

    if (target.type === 'pc' && target.characterId) {
      const result = await this.stateService.updateHp(
        dto.ownerUserId,
        target.characterId,
        { healing: dto.amount },
      );
      hpAfter = result.currentHp;
      if (!result.isDown && target.isDefeated) {
        target.isDefeated = false;
        await this.participantRepo.save(target);
      }
    } else {
      target.currentHp = Math.min(
        (target.currentHp ?? 0) + dto.amount,
        target.maxHp ?? 0,
      );
      if (target.currentHp > 0 && target.isDefeated) {
        target.isDefeated = false;
      }
      hpAfter = target.currentHp;
      await this.participantRepo.save(target);
    }

    const events: GameEventData[] = [
      {
        event_type: 'hp_change',
        target_participant_id: target.id,
        data: { healing: dto.amount, hpAfter },
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ hpAfter }, events);
  }

  // --- Conditions ---

  async applyCondition(
    encounterId: string,
    dto: ConditionDto,
  ): Promise<GameResult<{ conditions: string[] }>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const participant = await this.encounterService.getParticipant(
      dto.participantId,
    );

    let conditions = [...participant.conditions];

    if (dto.apply) {
      if (!conditions.includes(dto.condition)) {
        conditions.push(dto.condition);
      }
    } else {
      conditions = conditions.filter((c) => c !== dto.condition);
    }

    participant.conditions = conditions;
    await this.participantRepo.save(participant);

    // Sync to CharacterState for PCs
    if (participant.type === 'pc' && participant.characterId) {
      await this.stateService.updateConditions(
        dto.ownerUserId,
        participant.characterId,
        { conditions },
      );
    }

    const events: GameEventData[] = [
      {
        event_type: dto.apply ? 'condition_applied' : 'condition_removed',
        target_participant_id: participant.id,
        data: { condition: dto.condition, conditions },
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ conditions }, events);
  }

  // --- Death Saves ---

  async resolveDeathSave(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<DeathSaveResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const participant = await this.encounterService.getParticipant(
      participantId,
    );

    if (participant.type !== 'pc' || !participant.characterId) {
      return failure(
        'Death saves so se aplicam a PCs.',
        'INVALID_PARTICIPANT',
      );
    }

    const roll = this.diceService.roll(20);
    const dsResult = await this.stateService.updateDeathSaves(
      ownerUserId,
      participant.characterId,
      { rollValue: roll },
    );

    if (dsResult.dead) {
      participant.isDefeated = true;
      await this.participantRepo.save(participant);
    } else if (dsResult.revivedHp) {
      participant.isDefeated = false;
      await this.participantRepo.save(participant);
    }

    const result: DeathSaveResult = {
      roll,
      successes: dsResult.successes,
      failures: dsResult.failures,
      stabilized: dsResult.stabilized,
      dead: dsResult.dead,
      revivedHp: dsResult.revivedHp,
    };

    const events: GameEventData[] = [
      {
        event_type: 'death_save',
        actor_participant_id: participantId,
        data: result,
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success(result, events);
  }

  // --- Private Helpers ---

  private applyDamageToMonster(
    participant: EncounterParticipantEntity,
    amount: number,
  ): { hpAfter: number; defeated: boolean } {
    let remaining = amount;

    // Temp HP absorbs first
    if (participant.tempHp > 0) {
      if (remaining <= participant.tempHp) {
        participant.tempHp -= remaining;
        remaining = 0;
      } else {
        remaining -= participant.tempHp;
        participant.tempHp = 0;
      }
    }

    participant.currentHp = Math.max(
      (participant.currentHp ?? 0) - remaining,
      0,
    );

    const defeated = participant.currentHp <= 0;
    if (defeated) {
      participant.isDefeated = true;
    }

    return { hpAfter: participant.currentHp, defeated };
  }

  private async concentrationCheck(
    participant: EncounterParticipantEntity,
    damageTaken: number,
  ): Promise<ConcentrationCheckResult> {
    const dc = Math.max(10, Math.floor(damageTaken / 2));
    let conMod = 0;

    if (participant.type === 'monster' && participant.monster) {
      conMod = getAbilityModifier(participant.monster.constitution);
    }
    // For PCs, CON mod would need to be fetched from sheet
    // V1: simplified — uses monster's CON or 0 for PCs

    const roll = this.diceService.roll(20);
    const total = roll + conMod;
    const maintained = total >= dc;

    if (!maintained) {
      participant.isConcentrating = false;
      participant.concentratingOn = undefined;
      await this.participantRepo.save(participant);
    }

    return {
      dc,
      roll,
      modifier: conMod,
      total,
      maintained,
      spellName: participant.concentratingOn ?? undefined,
    };
  }
}
