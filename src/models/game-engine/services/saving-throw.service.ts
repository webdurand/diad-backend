import { Injectable } from '@nestjs/common';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { DiceService } from './dice.service';
import { ConditionEffectsService } from './condition-effects.service';
import { EventService } from './event.service';
import { InspirationService } from './inspiration.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';
import { SavingThrowResult } from '../interfaces/combat.interfaces';
import { AdvantageResult } from '../interfaces/dice.interfaces';

// --- DTOs ---

export interface SavingThrowDto {
  characterId: string;
  userId: string;
  ability: string;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  sessionId?: string;
  encounterId?: string;
  /**
   * Spec 012 — se informado, leitura+consumo de `inspirationArmed` do
   * participant adiciona advantage + zera flag encounter e ficha. Only
   * applies quando caller conhece o participant (caminho combate/encounter).
   */
  participantId?: string;
}

@Injectable()
export class SavingThrowService {
  constructor(
    private readonly sheetService: CharacterSheetService,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly eventService: EventService,
    private readonly inspirationService: InspirationService,
  ) {}

  async rollSavingThrow(dto: SavingThrowDto): Promise<GameResult<SavingThrowResult>> {
    const sheet = await this.sheetService.computeSheet(dto.userId, dto.characterId);
    if (!sheet) {
      return failure('Personagem nao encontrado.', 'INVALID_PARTICIPANT');
    }

    // Find saving throw bonus from computed sheet
    const saveBlock = sheet.savingThrows.find(
      (s) => s.slug === dto.ability || s.name.toLowerCase() === dto.ability.toLowerCase(),
    );
    if (!saveBlock) {
      return failure(`Ability '${dto.ability}' nao encontrada.`, 'INVALID_ACTION');
    }

    const modifier = saveBlock.bonus;

    // Check condition effects on saving throws
    const conditions = sheet.conditions ?? [];
    const condMods = this.conditionEffects.getSavingThrowModifiers(conditions, dto.ability);

    if (condMods.autoFail) {
      const result: SavingThrowResult = {
        ability: dto.ability,
        dc: dto.dc,
        roll: 0,
        modifier,
        total: 0,
        success: false,
      };
      return success(result, this.buildEvents(dto, 0, modifier, 0, false));
    }

    // Determine advantage/disadvantage
    let hasAdvantage = dto.advantage ?? false;
    let hasDisadvantage = dto.disadvantage ?? false;

    if (condMods.hasAdvantage) hasAdvantage = true;
    if (condMods.hasDisadvantage) hasDisadvantage = true;

    // Spec 012 — Heroic Inspiration: se armed, consome e aplica advantage.
    let inspirationEvent: GameEventData | null = null;
    if (dto.participantId) {
      const inspResult = await this.inspirationService.consumeIfArmed(
        dto.participantId,
        'saving_throw',
      );
      if (inspResult.consumed && inspResult.eventData) {
        hasAdvantage = true;
        inspirationEvent = inspResult.eventData;
      }
    }

    // Roll the d20
    let roll: number;
    let advantageResult: AdvantageResult | undefined;

    if (hasAdvantage && !hasDisadvantage) {
      const r = this.diceService.rollWithAdvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, chosen: r.chosen, discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1 };
    } else if (hasDisadvantage && !hasAdvantage) {
      const r = this.diceService.rollWithDisadvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, chosen: r.chosen, discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1 };
    } else {
      roll = this.diceService.roll(20);
    }

    const total = roll + modifier;
    const passed = total >= dto.dc;

    const result: SavingThrowResult = {
      ability: dto.ability,
      dc: dto.dc,
      roll,
      modifier,
      total,
      success: passed,
      advantage: advantageResult,
    };

    const events = this.buildEvents(dto, roll, modifier, total, passed);
    if (inspirationEvent) events.unshift(inspirationEvent);
    return success(result, events);
  }

  private buildEvents(
    dto: SavingThrowDto,
    roll: number,
    modifier: number,
    total: number,
    passed: boolean,
  ): GameEventData[] {
    return [
      {
        event_type: 'saving_throw',
        data: {
          character_id: dto.characterId,
          ability: dto.ability,
          dc: dto.dc,
          roll,
          modifier,
          total,
          success: passed,
        },
      },
    ];
  }
}
