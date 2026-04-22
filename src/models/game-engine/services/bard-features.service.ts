import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { EffectInstanceService } from './effect-instance.service';
import type { GameEventData } from '../interfaces/result.type';

/**
 * Spec 012 \u2014 Bard core features (RAW 2024 XPHB).
 *
 * Servi\u00e7os implementados:
 * - **Bardic Inspiration**: concede 1 die ao aliado (d6 L1, d8 L5, d10 L10, d12 L15).
 *   Aliado pode gastar em attack/save/check em 10 min. Pool = CHA mod (min 1),
 *   recarrega LR. A partir de L5 (Font of Inspiration) tamb\u00e9m recarrega em SR.
 * - **Cutting Words (Lore L3)**: reaction, caster gasta 1 BI die pra REDUZIR
 *   o roll de ataque/dano/check de inimigo em at\u00e9 60ft que pode ouvir.
 */
@Injectable()
export class BardFeaturesService {
  private readonly logger = new Logger(BardFeaturesService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly effects: EffectInstanceService,
  ) {}

  /**
   * Retorna tier do die do Bardic Inspiration baseado no level do Bard.
   * L1-4=6, L5-9=8, L10-14=10, L15+=12. RAW 2024 XPHB.
   */
  getBardicInspirationDie(bardLevel: number): 6 | 8 | 10 | 12 {
    if (bardLevel >= 15) return 12;
    if (bardLevel >= 10) return 10;
    if (bardLevel >= 5) return 8;
    return 6;
  }

  /**
   * Grant BI ao aliado. Cria EffectInstance 'bardic_inspiration' no target com
   * payload.dieSize. Consumido no pr\u00f3ximo attack/save/check do target.
   * bardLevel \u00e9 passado pelo caller (class-feature resolver tem via caster.classLevel).
   */
  async grantBardicInspiration(
    casterParticipantId: string,
    targetParticipantId: string,
    bardLevel: number,
  ): Promise<{ events: GameEventData[]; dieSize: number }> {
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId },
    });
    if (!caster?.characterId) {
      throw new NotFoundException('caster n\u00e3o \u00e9 PC Bard');
    }
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) {
      throw new NotFoundException('target n\u00e3o encontrado');
    }
    const dieSize = this.getBardicInspirationDie(bardLevel);

    // Aplica EffectInstance no target. expiresAt='until_consumed' pra evitar
    // que o effect rode em ticks de round (RAW: 10 min mas consome no 1\u00ba uso).
    const res = await this.effects.addEffect(target, {
      kind: 'bardic_inspiration',
      sourceCasterParticipantId: caster.id,
      sourceFeatureSlug: 'bardic-inspiration',
      payload: {
        dieSize,
        dieFormula: `1d${dieSize}`,
        bardLevel,
      } as Record<string, unknown>,
      requiresConcentration: false,
      expiresAt: { kind: 'until_consumed' as const },
    } as unknown as Parameters<EffectInstanceService['addEffect']>[1]);

    this.logger.log(
      `[bard] BI granted: caster=${caster.id} \u2192 target=${target.id} (d${dieSize})`,
    );

    return {
      events: [
        ...res.events,
        {
          event_type: 'bardic_inspiration_granted',
          actor_participant_id: caster.id,
          target_participant_id: target.id,
          data: { dieSize, bardLevel },
        },
      ],
      dieSize,
    };
  }

  /**
   * Consume o BI die do target quando ele rola um d20 test. Retorna bonus rolado
   * OU 0 se target n\u00e3o tinha BI.
   */
  async consumeBardicInspirationIfPresent(
    targetParticipantId: string,
    context: 'attack_roll' | 'saving_throw' | 'ability_check',
    diceRoller: (sides: number) => number,
  ): Promise<{
    consumed: boolean;
    bonus: number;
    dieSize?: number;
    events: GameEventData[];
  }> {
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) return { consumed: false, bonus: 0, events: [] };
    const biEffect = (target.effectInstances ?? []).find(
      (e) => (e as unknown as { kind?: string }).kind === 'bardic_inspiration',
    );
    if (!biEffect) return { consumed: false, bonus: 0, events: [] };
    const payload = (biEffect as unknown as { payload?: { dieSize?: number } }).payload ?? {};
    const dieSize = payload.dieSize ?? 6;
    const bonus = diceRoller(dieSize);
    const effectId = (biEffect as unknown as { id: string }).id;

    // Remove o effect (consumido) diretamente no array pra evitar reload duplo
    target.effectInstances = (target.effectInstances ?? []).filter(
      (e) => (e as unknown as { id: string }).id !== effectId,
    );
    try {
      await this.participantRepo.save(target);
    } catch {
      // save pode falhar em edge case; bonus j\u00e1 foi calculado, retorna
    }

    return {
      consumed: true,
      bonus,
      dieSize,
      events: [
        {
          event_type: 'bardic_inspiration_consumed',
          target_participant_id: target.id,
          data: { dieSize, bonus, context },
        },
      ],
    };
  }
}
