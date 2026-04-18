import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { GameEventData } from '../interfaces/result.type';

/**
 * Spec 012 — Heroic Inspiration.
 *
 * Encapsula a leitura + consumo do flag `inspirationArmed` pra qualquer
 * roll-site (attack / save / skill-check). Mantém o RAW 2024 consistente:
 *   - Se armed=true, roll tem advantage.
 *   - Ao consumir, reset EncounterParticipant.inspirationArmed + CharacterState.inspiration.
 *   - Emite evento `inspiration_used` com o context do caller.
 *
 * Uso típico:
 *   const consumed = await inspirationService.consumeIfArmed(participantId, 'attack_roll');
 *   if (consumed) hasAdvantage = true;
 */
@Injectable()
export class InspirationService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly stateService: CharacterStateService,
  ) {}

  /**
   * Lê `inspirationArmed` do participant. Não consome — usar `consumeIfArmed`
   * pra fazer leitura + reset em uma call.
   */
  async isArmed(participantId: string): Promise<boolean> {
    const p = await this.participantRepo.findOne({
      where: { id: participantId },
      select: ['id', 'inspirationArmed'],
    });
    return p?.inspirationArmed === true;
  }

  /**
   * Se `inspirationArmed=true`, reseta flag do encounter + `character_state.inspiration`
   * e retorna true (caller deve aplicar advantage + emitir evento). Caso contrário false.
   *
   * **Idempotente**: chamar duas vezes na mesma roll só consome 1 carga.
   */
  async consumeIfArmed(
    participantId: string,
    context: 'attack_roll' | 'saving_throw' | 'ability_check',
  ): Promise<{ consumed: boolean; eventData?: GameEventData }> {
    const p = await this.participantRepo.findOne({ where: { id: participantId } });
    if (!p || !p.inspirationArmed) return { consumed: false };

    p.inspirationArmed = false;
    await this.participantRepo.save(p);

    if (p.type === 'pc' && p.characterId) {
      await this.stateService
        .setInspiration(p.characterId, false)
        .catch(() => null);
    }

    const eventData: GameEventData = {
      event_type: 'inspiration_used',
      actor_participant_id: p.id,
      data: { context },
    };
    return { consumed: true, eventData };
  }
}
