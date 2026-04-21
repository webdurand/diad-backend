import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { EncounterService } from './encounter.service';
import { DiceService } from './dice.service';
import { EventService } from './event.service';
import { EffectInstanceService } from './effect-instance.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';

/**
 * Paladin features (RAW 2024 XPHB):
 *
 *  - L1 Divine Smite: spell L1 (Evocation), Bonus Action imediatamente após
 *    hit com melee weapon OU unarmed. Base 2d8 radiant + (slotLevel-1)×1d8
 *    (cap 5d8 em slot 4+). +1d8 adicional se target é Fiend ou Undead.
 *    Crit dobra os dice. NÃO aplica em ranged/spell attacks.
 *
 *  - L2 Paladin's Smite: 1 cast grátis de Divine Smite /long rest (sem slot).
 *    Endpoint aceita `freeCast: true` pra bypass slot consumption.
 *
 *  - L11 Radiant Strikes (substitui Improved Divine Smite 2014): passive rider
 *    +1d8 radiant em hit melee/unarmed. Stacka com Divine Smite.
 *
 *  - Devotion L3 Sacred Weapon (CD): bônus CHA em attack rolls + arma emite
 *    radiant damage + luz 20ft por 1 min. 1 use CD.
 */
@Injectable()
export class PaladinFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
    private readonly effectInstances: EffectInstanceService,
  ) {}

  /**
   * Divine Smite (RAW 2024 XPHB): chamado após hit confirmado com melee/unarmed.
   * Backend calcula damage + aplica. Cliente envia:
   *  - targetParticipantId
   *  - slotLevel (1-9; 0/null se freeCast via Paladin's Smite)
   *  - hitWasCritical (boolean — dobra dice)
   *  - targetType ('fiend'|'undead'|null — +1d8 adicional se fiend/undead)
   *  - freeCast (boolean — Paladin's Smite L2, não consome slot)
   */
  async divineSmite(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
    slotLevel: number,
    hitWasCritical: boolean,
    targetType: 'fiend' | 'undead' | null,
    freeCast: boolean,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      baseDice: number;
      fiendUndeadBonus: boolean;
      critical: boolean;
      slotConsumed: boolean;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== 'pc' || !paladin.characterId) {
      return failure('Apenas PCs.', 'INVALID_PARTICIPANT');
    }
    const sheet = await this.sheetService.computeSheet(userId, paladin.characterId);
    const hasSmite = (sheet as unknown as { hasDivineSmite?: boolean }).hasDivineSmite === true;
    const paladinLv = (sheet.classes ?? []).find((c) => c.slug === 'paladin')?.level ?? 0;
    if (!hasSmite || paladinLv < 1) {
      return failure('Requer Paladin L1+ com Divine Smite.', 'FEATURE_NOT_AVAILABLE');
    }

    // Paladin's Smite L2 necessário pra free cast
    if (freeCast) {
      const hasFreeSmite = (sheet as unknown as { hasPaladinsSmite?: boolean }).hasPaladinsSmite === true;
      if (!hasFreeSmite || paladinLv < 2) {
        return failure('Requer Paladin L2+ com Paladin\'s Smite pra free cast.', 'FEATURE_NOT_AVAILABLE');
      }
    } else {
      if (slotLevel < 1 || slotLevel > 9) {
        return failure('slotLevel inválido (1-9).', 'INVALID_SLOT');
      }
    }

    // RAW 2024: base 2d8 + (slotLevel-1)×1d8, cap slot 4+ = 5d8
    // Fiend/Undead bonus: +1d8 adicional.
    const effectiveSlot = freeCast ? 1 : Math.min(slotLevel, 4);
    const baseDice = 2 + (effectiveSlot - 1); // 2d8, 3d8, 4d8, 5d8
    const fiendUndeadBonus = targetType === 'fiend' || targetType === 'undead';
    const bonusDice = fiendUndeadBonus ? 1 : 0;
    let totalDice = baseDice + bonusDice;
    if (hitWasCritical) totalDice *= 2;

    let damage = 0;
    for (let i = 0; i < totalDice; i++) damage += this.dice.roll(8);

    const target = await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);

    // MVP: freeCast não consome slot. slot consumption de slot normal é
    // responsabilidade do cast spell flow (harness controla via /cast-spell
    // do game-engine; esse endpoint assume slot já consumido upstream).
    const slotConsumed = !freeCast;

    const event: GameEventData = {
      event_type: 'class_feature_triggered',
      actor_participant_id: paladin.id,
      target_participant_id: target.id,
      data: {
        featureSlug: 'divine-smite',
        damage,
        diceCount: totalDice,
        baseDice,
        bonusDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotLevel: freeCast ? 0 : slotLevel,
        freeCast,
        slotConsumed,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
    };
    const enc = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      {
        damage,
        diceCount: totalDice,
        baseDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotConsumed,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
      [event],
    );
  }

  /**
   * Radiant Strikes (Paladin L11+, RAW 2024): passive +1d8 radiant em hit
   * melee/unarmed. Endpoint chamado pós hit confirmado, stacka com Divine Smite.
   */
  async radiantStrikes(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== 'pc' || !paladin.characterId) {
      return failure('Apenas PCs.', 'INVALID_PARTICIPANT');
    }
    const sheet = await this.sheetService.computeSheet(userId, paladin.characterId);
    const hasRS = (sheet as unknown as { hasRadiantStrikes?: boolean }).hasRadiantStrikes === true;
    const paladinLv = (sheet.classes ?? []).find((c) => c.slug === 'paladin')?.level ?? 0;
    if (!hasRS || paladinLv < 11) {
      return failure('Requer Paladin L11+ com Radiant Strikes.', 'FEATURE_NOT_AVAILABLE');
    }

    const damage = this.dice.roll(8);
    const target = await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);

    const event: GameEventData = {
      event_type: 'class_feature_triggered',
      actor_participant_id: paladin.id,
      target_participant_id: target.id,
      data: {
        featureSlug: 'radiant-strikes',
        damage,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
    };
    const enc = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ damage, targetPrevHp: prevHp, targetNewHp: target.currentHp }, [event]);
  }

  /**
   * Sacred Weapon (Paladin Devotion L3 CD): arma +CHA em attack rolls + radiant
   * damage + luz 20ft por 1 min. MVP: aplica effect marker (buff) no paladin.
   */
  async sacredWeapon(
    userId: string,
    encounterId: string,
    participantId: string,
  ): Promise<
    GameResult<{
      chaBonus: number;
      durationRounds: number;
      armed: boolean;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== 'pc' || !paladin.characterId) {
      return failure('Apenas PCs.', 'INVALID_PARTICIPANT');
    }
    const sheet = await this.sheetService.computeSheet(userId, paladin.characterId);
    const hasSW = (sheet as unknown as { hasSacredWeapon?: boolean }).hasSacredWeapon === true;
    if (!hasSW) {
      return failure('Requer Paladin Devotion L3+ com Sacred Weapon.', 'FEATURE_NOT_AVAILABLE');
    }
    const chaAbility = sheet.abilityScores.find((a) => a.slug === 'cha');
    const chaBonus = chaAbility?.modifier ?? 0;

    // Effect: damage_bonus em melee attacks + buff marker visible
    await this.effectInstances.addEffect(paladin, {
      kind: 'damage_bonus',
      sourceFeatureSlug: 'sacred-weapon',
      sourceCasterParticipantId: paladin.id,
      payload: { amount: chaBonus, scope: 'melee' },
      expiresAt: { kind: 'rounds', value: 10 }, // 1 min = 10 rounds
      requiresConcentration: false,
    });

    const event: GameEventData = {
      event_type: 'class_feature_triggered',
      actor_participant_id: paladin.id,
      data: {
        featureSlug: 'sacred-weapon',
        chaBonus,
        durationRounds: 10,
      },
    };
    const enc = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ chaBonus, durationRounds: 10, armed: true }, [event]);
  }
}
