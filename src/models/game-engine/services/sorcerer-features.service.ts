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


    await this.spellService.updateSpellSlots(
      ownerUserId,
      participant.characterId,
      {
        level: slotLevel,
        used: slotBlock.used + 1,
      },
    );



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
