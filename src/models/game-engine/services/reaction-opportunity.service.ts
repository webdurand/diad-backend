import { Injectable, Logger } from '@nestjs/common';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';

/**
 * Spec 015 Eixo 7 — ReactionOpportunityService.
 *
 * Dado um evento de gatilho (attack_roll hit, saving throw failed, ability check
 * rolled, spell cast nearby, etc.), retorna os reactors elegíveis e a reação
 * específica que cada um pode oferecer. O frontend consome os `*_opportunity`
 * events emitidos e abre o popup correspondente.
 *
 * MVP: apenas Shield spell (wizard/sorcerer L1). Pattern se estende pra:
 *  - Counterspell (trigger: spell_cast_nearby)
 *  - Cutting Words (trigger: attack_roll por inimigo / ability_check / save)
 *  - Hellish Rebuke (trigger: self_damaged)
 *  - Absorb Elements (trigger: self_damaged com tipo elemental)
 */
@Injectable()
export class ReactionOpportunityService {
  private readonly logger = new Logger(ReactionOpportunityService.name);

  constructor(
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
  ) {}

  /**
   * Spec 015 Eixo 7 — Shield spell (RAW PHB/XPHB 2024 p.289).
   *
   * Pré-requisitos RAW pra oferecer Shield como reação retroactive:
   *  - Target é PC vivo (type=pc + characterId + currentHp > 0)
   *  - Target ainda não usou reaction neste round (reactionsUsed === 0)
   *  - Sheet contém spell 'shield' preparado OU aprendido (varia por classe)
   *  - Target tem ≥ 1 slot L1+ disponível
   *  - O ataque ACERTOU (já validado no caller — só chamamos se hit=true)
   *  - O hit é "marginal" — totalAttack < AC+5 → cast resolveria em miss
   *    (evita oferecer Shield quando não salvaria, poupa UX).
   */
  async shouldOfferShield(
    target: EncounterParticipantEntity,
    attackTotal: number,
    targetAc: number,
    ownerUserId: string,
  ): Promise<{ slotLevel: number; reactorName: string } | null> {
    if (target.type !== 'pc' || !target.characterId) return null;
    if ((target.reactionsUsed ?? 0) > 0) return null;
    if ((target.currentHp ?? 0) <= 0) return null;
    // Shield só vale se viraria miss (+5 AC).
    if (attackTotal >= targetAc + 5) return null;

    let sheet: Awaited<ReturnType<CharacterSheetService['computeSheet']>>;
    try {
      sheet = await this.sheetService.computeSheet(ownerUserId, target.characterId);
    } catch (err) {
      this.logger.debug(`[shouldOfferShield] sheet fetch fail: ${err instanceof Error ? err.message : err}`);
      return null;
    }

    // Shield no repertório (prepared OU always-prepared cantrip-like).
    const shieldSpell = (sheet.spells ?? []).find((s) => {
      const slugNorm = s.slug.replace(/-(phb|xphb|tce|xge|fttod)$/, '');
      return slugNorm === 'shield' && (s.status === 'prepared' || s.alwaysPrepared);
    });
    if (!shieldSpell) return null;

    // Slot L1+ disponível (Shield é L1; pode upcast mas não ganha benefício).
    const slot = (sheet.spellSlots ?? []).find(
      (s) => s.level >= 1 && s.total - s.used > 0,
    );
    if (!slot) return null;

    return {
      slotLevel: slot.level,
      reactorName: target.displayName,
    };
  }
}
