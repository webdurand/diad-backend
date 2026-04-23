import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { EffectInstanceService } from './effect-instance.service';
import type { GameEventData } from '../interfaces/result.type';
import type { EffectInstance } from '../interfaces/combat.interfaces';

export interface TransferMarkDto {
  encounterId: string;
  casterParticipantId: string;
  newTargetParticipantId: string;
  sourceSpellSlug: 'hunters-mark' | 'hex';
  ownerUserId: string;
}

export interface TransferMarkResult {
  ok: boolean;
  code?: string;
  message?: string;
  events?: GameEventData[];
  transferredEffectId?: string;
}

/**
 * Spec 012 — Mark Transfer (Hunter's Mark / Hex RAW 2024 XPHB).
 *
 * Quando o alvo marcado cai a 0 HP antes da spell expirar, o caster pode
 * mover a mark para um novo alvo usando bonus action no seu turno subsequente,
 * SEM gastar novo slot. A concentração permanece ativa (só muda o alvo).
 *
 * Fluxo:
 *  - combat.service emite `mark_ready_to_transfer` quando o target morre.
 *  - UI mostra prompt; player chama este endpoint no turno seguinte.
 *  - Este service valida pré-requisitos e move o effectInstance + tracker
 *    do caster para o novo alvo.
 *
 * Pré-requisitos validados:
 *  - Caster possui um AppliedEffect de concentração marcando spell HM/Hex.
 *  - Bonus action ainda não foi gasta.
 *  - Novo alvo existe no encontro e não está derrotado.
 */
@Injectable()
export class MarkTransferService {
  private readonly logger = new Logger(MarkTransferService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    private readonly effects: EffectInstanceService,
  ) {}

  async transferMark(dto: TransferMarkDto): Promise<TransferMarkResult> {
    const caster = await this.participants.findOne({
      where: { id: dto.casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException(
        `caster ${dto.casterParticipantId} not found`,
      );
    }
    if (caster.encounterId !== dto.encounterId) {
      throw new BadRequestException(
        'CASTER_NOT_IN_ENCOUNTER: caster não está no encontro informado',
      );
    }

    const expectedKind =
      dto.sourceSpellSlug === 'hunters-mark' ? 'hunter_mark' : 'hex_mark';

    // 1. Procurar um effect órfão: sourceCaster=caster, kind=hunter_mark/hex_mark,
    //    ainda aplicado num target (morto ou vivo) dentro do encontro.
    const encounterParticipants = await this.participants.find({
      where: { encounterId: dto.encounterId },
    });

    let orphanEffect: EffectInstance | undefined;
    let previousTarget: EncounterParticipantEntity | undefined;
    for (const p of encounterParticipants) {
      const hit = (p.effectInstances ?? []).find(
        (e) =>
          e.kind === expectedKind &&
          e.sourceCasterParticipantId === caster.id &&
          e.sourceSpellSlug === dto.sourceSpellSlug,
      );
      if (hit) {
        orphanEffect = hit;
        previousTarget = p;
        break;
      }
    }

    if (!orphanEffect || !previousTarget) {
      return {
        ok: false,
        code: 'NO_TRANSFERABLE_MARK',
        message: `Nenhuma ${dto.sourceSpellSlug} ativa deste caster para transferir.`,
      };
    }

    // 2. Verificar bonus action disponível
    if (caster.bonusActionUsed) {
      return {
        ok: false,
        code: 'BONUS_ACTION_UNAVAILABLE',
        message: 'Bonus action já foi usada neste turno.',
      };
    }

    // 3. Verificar novo alvo
    if (dto.newTargetParticipantId === previousTarget.id) {
      return {
        ok: false,
        code: 'SAME_TARGET',
        message: 'Novo alvo deve ser diferente do alvo anterior.',
      };
    }

    const newTarget = encounterParticipants.find(
      (p) => p.id === dto.newTargetParticipantId,
    );
    if (!newTarget) {
      return {
        ok: false,
        code: 'TARGET_NOT_FOUND',
        message: `Participant ${dto.newTargetParticipantId} não existe no encontro.`,
      };
    }
    if (newTarget.isDefeated || newTarget.dyingState === 'dead') {
      return {
        ok: false,
        code: 'TARGET_DEFEATED',
        message: 'Não é possível marcar um alvo já derrotado.',
      };
    }

    // 4. Remover do alvo anterior (com reason='manual' pra não cascade-break
    //    concentração — só estamos movendo). removeEffect também limpa o tracker
    //    appliedEffects do caster; vamos re-adicionar via addEffect abaixo, que
    //    recria o tracker. Assim a concentração continua armada.
    const removed = await this.effects.removeEffect(
      previousTarget,
      orphanEffect.id,
      'manual',
    );

    // 5. Aplicar no novo alvo (mesmo payload, mesma duração).
    const applied = await this.effects.addEffect(newTarget, {
      kind: expectedKind,
      sourceSpellSlug: dto.sourceSpellSlug,
      sourceCasterParticipantId: caster.id,
      payload: orphanEffect.payload,
      expiresAt: orphanEffect.expiresAt,
      requiresConcentration: orphanEffect.requiresConcentration,
    });

    // 6. Consumir bonus action do caster.
    caster.bonusActionUsed = true;
    await this.participants.save(caster);

    const events: GameEventData[] = [
      ...removed.events,
      ...applied.events,
      {
        event_type: 'mark_transferred',
        actor_participant_id: caster.id,
        target_participant_id: newTarget.id,
        data: {
          sourceSpell: dto.sourceSpellSlug,
          fromTargetId: previousTarget.id,
          toTargetId: newTarget.id,
          previousEffectId: orphanEffect.id,
          newEffectId: applied.effect.id,
          bonusActionConsumed: true,
        },
      },
    ];

    this.logger.log(
      `[mark-transfer] ${dto.sourceSpellSlug} caster=${caster.id} ${previousTarget.id} → ${newTarget.id}`,
    );

    return {
      ok: true,
      events,
      transferredEffectId: applied.effect.id,
    };
  }
}
