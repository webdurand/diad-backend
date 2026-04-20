import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { EncounterService } from './encounter.service';
import { DiceService } from './dice.service';
import { EventService } from './event.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';

/**
 * Fighter Tactical trio (XPHB 2024):
 *  - Tactical Mind L2: após failed ability check, gasta 1 Second Wind use,
 *    rola 1d10, adiciona ao total. Se passar: consome use. Se falhar: refund.
 *  - Tactical Shift L5: rider do Second Wind (handled em handleSecondWind).
 *  - Tactical Master L9: ao atacar com weapon que você domina, pode trocar
 *    a mastery própria pela Push, Sap ou Slow.
 *
 * Tactical Shift é implementado dentro de handleSecondWind (class-feature-executor)
 * porque é rider, não feature separada invocável.
 */
@Injectable()
export class TacticalFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
  ) {}

  /**
   * Tactical Mind (Fighter L2, RAW 2024). Input: check total original + DC +
   * ability mod (pra saber quanto foi o roll puro). Rola 1d10, soma ao total.
   * Se novo total >= DC: success + consome 1 Second Wind use.
   * Se não: failed, refund (não consome).
   */
  async tacticalMind(
    userId: string,
    encounterId: string,
    participantId: string,
    originalCheckTotal: number,
    dc: number,
  ): Promise<GameResult<{
    bonusRoll: number;
    newTotal: number;
    success: boolean;
    secondWindConsumed: boolean;
  }>> {
    const participant = await this.encounterService.getParticipant(participantId);
    if (participant.type !== 'pc' || !participant.characterId) {
      return failure('Apenas PCs.', 'INVALID_PARTICIPANT');
    }

    const sheet = await this.sheetService.computeSheet(userId, participant.characterId);
    const fighterLv = (sheet.classes ?? []).find((c) => c.slug === 'fighter')?.level ?? 0;
    if (fighterLv < 2) {
      return failure('Tactical Mind requer Fighter L2+.', 'FEATURE_NOT_AVAILABLE');
    }
    const hasFeature = ((sheet as unknown as { features?: Array<{ slug: string; active?: boolean }> }).features ?? [])
      .filter((f) => f.active !== false)
      .some((f) => f.slug.startsWith('tactical-mind'));
    if (!hasFeature) {
      return failure('Você não tem Tactical Mind.', 'FEATURE_NOT_AVAILABLE');
    }

    // Second Wind pool check
    const maxSw = fighterLv >= 10 ? 3 : fighterLv >= 4 ? 2 : 1;
    const sheetState = (sheet as unknown as { featureUsesUsed?: Record<string, number> });
    const swUsed = sheetState.featureUsesUsed?.['second-wind'] ?? 0;
    if (swUsed >= maxSw) {
      return failure('Sem usos de Second Wind disponíveis.', 'NO_USES_REMAINING');
    }

    // Rola 1d10 + adiciona ao total original
    const bonusRoll = this.dice.roll(10);
    const newTotal = originalCheckTotal + bonusRoll;
    const passed = newTotal >= dc;

    let consumed = false;
    if (passed) {
      await this.stateService.incrementFeatureUses(participant.characterId, 'second-wind', 1);
      consumed = true;
    }

    const event: GameEventData = {
      event_type: 'class_feature_triggered',
      actor_participant_id: participant.id,
      data: {
        featureSlug: 'tactical-mind',
        originalCheckTotal,
        dc,
        bonusRoll,
        newTotal,
        success: passed,
        secondWindConsumed: consumed,
      },
    };
    const enc = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      { bonusRoll, newTotal, success: passed, secondWindConsumed: consumed },
      [event],
    );
  }

  /**
   * Tactical Master (Fighter L9, RAW 2024): arma flag `tactical_master_override`
   * no participant com a mastery alternativa. combat.service checa esse flag
   * no próximo attack e aplica mastery alternativa em vez da original.
   * Simplificação: guarda override como effect one-shot até próximo attack.
   */
  async tacticalMasterArm(
    userId: string,
    encounterId: string,
    participantId: string,
    masteryOverride: 'push' | 'sap' | 'slow',
  ): Promise<GameResult<{ armed: boolean; masteryOverride: string }>> {
    const participant = await this.encounterService.getParticipant(participantId);
    if (participant.type !== 'pc' || !participant.characterId) {
      return failure('Apenas PCs.', 'INVALID_PARTICIPANT');
    }

    const sheet = await this.sheetService.computeSheet(userId, participant.characterId);
    const hasFeature = ((sheet as unknown as { features?: Array<{ slug: string; active?: boolean }> }).features ?? [])
      .filter((f) => f.active !== false)
      .some((f) => f.slug.startsWith('tactical-master'));
    if (!hasFeature) {
      return failure('Você não tem Tactical Master.', 'FEATURE_NOT_AVAILABLE');
    }

    // Guarda no participant via campo dedicado (migration posterior) OU via
    // effectInstances. Simplificação imediata: usa campo novo no participant
    // (via migration separada se necessário). Pragmático: stash no campo
    // tacticalMasterOverride adicionado direto via query.
    participant.tacticalMasterOverride = masteryOverride;
    await this.participantRepo.save(participant);

    const event: GameEventData = {
      event_type: 'class_feature_triggered',
      actor_participant_id: participant.id,
      data: {
        featureSlug: 'tactical-master',
        trigger: 'arm_override',
        masteryOverride,
      },
    };
    const enc = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ armed: true, masteryOverride }, [event]);
  }
}
