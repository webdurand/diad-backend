import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { SpellService } from "src/models/characters/services/spell.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";

/**
 * Spec 012 Sorcerer — Font of Magic (L2+).
 *
 * Sorcery Points pool = sorcerer class level (2..20). Operações:
 * - `convertSlotToSp`: gasta 1 spell slot, ganha N SP (N = nível do slot).
 * - `convertSpToSlot`: gasta SP conforme tabela RAW, ganha 1 spell slot do nível pedido.
 *
 * Tabela RAW XPHB 2024 "Creating Spell Slots":
 *   L1 slot = 2 SP  |  L2 slot = 3 SP  |  L3 slot = 5 SP
 *   L4 slot = 6 SP  |  L5 slot = 7 SP
 * Cap: não cria slots L6+ via Font of Magic (RAW).
 *
 * Invariantes:
 * - SP usados nunca excede pool total (classLevel).
 * - Conversion ocorre no encounter-context (participant.sorceryPointsUsed).
 * - Reset: full em long rest; Sorcerous Restoration L5 regain floor(max/2) em SR (1/LR).
 */

const SP_COST_FOR_SLOT: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 7,
};

export interface SorceryPointsState {
  total: number;
  used: number;
  remaining: number;
}

@Injectable()
export class SorcererFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly spellService: SpellService,
  ) {}

  /**
   * Retorna pool SP (total/used/remaining) pra um participant Sorcerer. Zero
   * se participant não é sorcerer ou é L1 (pool só existe a partir de L2).
   */
  async getSorceryPointsState(
    participantId: string,
    ownerUserId: string,
  ): Promise<SorceryPointsState> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.characterId) {
      return { total: 0, used: 0, remaining: 0 };
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const sorcClass = (sheet as any).classes?.find(
      (c: any) => c.slug === "sorcerer",
    );
    const total = sorcClass && sorcClass.level >= 2 ? sorcClass.level : 0;
    const used = participant.sorceryPointsUsed ?? 0;
    return { total, used, remaining: Math.max(0, total - used) };
  }

  /**
   * Converte 1 spell slot em SP. Gasta o slot (slot.used += 1), ganha N SP
   * (N = slotLevel), decrementa sorcery_points_used (pool).
   */
  async convertSlotToSp(
    participantId: string,
    slotLevel: number,
    ownerUserId: string,
  ): Promise<GameResult<{ gained: number; pool: SorceryPointsState }>> {
    if (slotLevel < 1 || slotLevel > 5) {
      return failure(
        `Slot level ${slotLevel} inválido (Font of Magic: 1-5).`,
        "INVALID_ACTION",
      );
    }
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.characterId) {
      return failure("Participant inválido.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const sorcClass = (sheet as any).classes?.find(
      (c: any) => c.slug === "sorcerer",
    );
    if (!sorcClass || sorcClass.level < 2) {
      return failure("Font of Magic requer Sorcerer L2+.", "INVALID_ACTION");
    }
    const slotBlock = (sheet.spellSlots ?? []).find(
      (s) => s.level === slotLevel && s.kind !== "pact",
    );
    if (!slotBlock || slotBlock.used >= slotBlock.total) {
      return failure(
        `Sem slot L${slotLevel} disponível pra converter.`,
        "INSUFFICIENT_SPELL_SLOTS",
      );
    }

    // Consume the slot
    await this.spellService.updateSpellSlots(
      ownerUserId,
      participant.characterId,
      {
        level: slotLevel,
        used: slotBlock.used + 1,
      },
    );

    // Refund SP (used -= slotLevel, floor 0). Font of Magic NÃO permite
    // ultrapassar pool máximo; se refund > used, clamp em 0.
    const prevUsed = participant.sorceryPointsUsed ?? 0;
    const newUsed = Math.max(0, prevUsed - slotLevel);
    const actuallyGained = prevUsed - newUsed;
    participant.sorceryPointsUsed = newUsed;
    await this.participantRepo.save(participant);

    const total = sorcClass.level;
    const events: GameEventData[] = [
      {
        event_type: "sorcery_points_gained",
        actor_participant_id: participantId,
        data: {
          source: "convert-slot",
          slotLevelConsumed: slotLevel,
          gained: actuallyGained,
          poolUsed: newUsed,
          poolTotal: total,
        },
      },
    ];

    return success(
      {
        gained: actuallyGained,
        pool: { total, used: newUsed, remaining: total - newUsed },
      },
      events,
    );
  }

  /**
   * Converte SP em 1 spell slot (level 1..5 per RAW). Debita SP pool,
   * decrementa slot.used (refund 1 slot).
   */
  async convertSpToSlot(
    participantId: string,
    targetSlotLevel: number,
    ownerUserId: string,
  ): Promise<GameResult<{ cost: number; pool: SorceryPointsState }>> {
    const cost = SP_COST_FOR_SLOT[targetSlotLevel];
    if (!cost) {
      return failure(
        `Slot L${targetSlotLevel} não pode ser criado via Font of Magic (RAW 2024: L1-L5).`,
        "INVALID_ACTION",
      );
    }
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.characterId) {
      return failure("Participant inválido.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const sorcClass = (sheet as any).classes?.find(
      (c: any) => c.slug === "sorcerer",
    );
    if (!sorcClass || sorcClass.level < 2) {
      return failure("Font of Magic requer Sorcerer L2+.", "INVALID_ACTION");
    }
    const total = sorcClass.level;
    const prevUsed = participant.sorceryPointsUsed ?? 0;
    const remaining = total - prevUsed;
    if (remaining < cost) {
      return failure(
        `SP insuficiente: requer ${cost}, tem ${remaining}.`,
        "INSUFFICIENT_SPELL_SLOTS",
      );
    }

    // Refund 1 slot do target level (se há used >= 1; senão pode criar "bonus
    // slot" acima do total? RAW diz "create spell slot below 6th level of
    // slot you don't currently have". Implementação MVP: só refund se há
    // used ≥ 1). Gap documentado: bonus slot ainda não implementado.
    const slotBlock = (sheet.spellSlots ?? []).find(
      (s) => s.level === targetSlotLevel && s.kind !== "pact",
    );
    if (!slotBlock) {
      return failure(
        `Sorcerer não tem slots L${targetSlotLevel} no nível atual.`,
        "INVALID_ACTION",
      );
    }
    if (slotBlock.used === 0) {
      // Pool cheio já. RAW permite criar "extra slot" — MVP rejeita pra V2.
      return failure(
        `Slot L${targetSlotLevel} não está gasto; Font of Magic MVP só refunda usos (sem bonus slot).`,
        "INVALID_ACTION",
      );
    }
    await this.spellService.updateSpellSlots(
      ownerUserId,
      participant.characterId,
      {
        level: targetSlotLevel,
        used: Math.max(0, slotBlock.used - 1),
      },
    );

    // Debit SP
    const newUsed = prevUsed + cost;
    participant.sorceryPointsUsed = newUsed;
    await this.participantRepo.save(participant);

    const events: GameEventData[] = [
      {
        event_type: "sorcery_points_spent",
        actor_participant_id: participantId,
        data: {
          source: "convert-to-slot",
          slotLevelCreated: targetSlotLevel,
          cost,
          poolUsed: newUsed,
          poolTotal: total,
        },
      },
    ];

    return success(
      { cost, pool: { total, used: newUsed, remaining: total - newUsed } },
      events,
    );
  }

  /**
   * Sorcerer L5 Sorcerous Restoration — 1/LR uso em short rest recupera
   * floor(classLevel/2) SP. Flag `sorcerous_restoration_used` marca consumo.
   * Reset em long rest (não implementado aqui — spec de long rest handling).
   */
  async sorcerousRestoration(
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<{ regained: number; pool: SorceryPointsState }>> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.characterId) {
      return failure("Participant inválido.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      participant.characterId,
    );
    const sorcClass = (sheet as any).classes?.find(
      (c: any) => c.slug === "sorcerer",
    );
    if (!sorcClass || sorcClass.level < 5) {
      return failure(
        "Sorcerous Restoration requer Sorcerer L5+.",
        "INVALID_ACTION",
      );
    }
    if (participant.sorcerousRestorationUsed) {
      return failure(
        "Sorcerous Restoration já utilizada nesta long rest.",
        "INVALID_ACTION",
      );
    }

    const total = sorcClass.level;
    const maxRegain = Math.floor(total / 2);
    const prevUsed = participant.sorceryPointsUsed ?? 0;
    if (prevUsed === 0) {
      return failure(
        "Pool de SP já está cheio; nada para restaurar.",
        "INVALID_ACTION",
      );
    }

    // Regain até maxRegain, mas sem ultrapassar total.
    const regained = Math.min(maxRegain, prevUsed);
    const newUsed = prevUsed - regained;
    participant.sorceryPointsUsed = newUsed;
    participant.sorcerousRestorationUsed = true;
    await this.participantRepo.save(participant);

    const events: GameEventData[] = [
      {
        event_type: "sorcerous_restoration",
        actor_participant_id: participantId,
        data: {
          regained,
          poolUsed: newUsed,
          poolTotal: total,
        },
      },
    ];

    return success(
      { regained, pool: { total, used: newUsed, remaining: total - newUsed } },
      events,
    );
  }
}
