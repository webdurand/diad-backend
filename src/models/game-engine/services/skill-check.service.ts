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

// --- Result interfaces ---

export interface SkillCheckResult {
  ability: string;
  skill?: string;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  proficient: boolean;
  expertise: boolean;
  advantage?: { roll1: number; roll2: number; used: number };
}

// --- DTOs ---

export interface SkillCheckDto {
  characterId: string;
  userId: string;
  ability: string;
  skill?: string;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  sessionId?: string;
  encounterId?: string;
  /** Spec 012 — quando informado, `inspirationArmed` do participant dá advantage + consome. */
  participantId?: string;
}

@Injectable()
export class SkillCheckService {
  constructor(
    private readonly sheetService: CharacterSheetService,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly eventService: EventService,
    private readonly inspirationService: InspirationService,
  ) {}

  async rollAbilityCheck(dto: SkillCheckDto): Promise<GameResult<SkillCheckResult>> {
    const sheet = await this.sheetService.computeSheet(dto.userId, dto.characterId);
    if (!sheet) {
      return failure('Personagem nao encontrado.', 'INVALID_PARTICIPANT');
    }

    // Find the ability modifier
    const abilityScore = sheet.abilityScores.find(
      (a) => a.slug === dto.ability || a.name.toLowerCase() === dto.ability.toLowerCase(),
    );
    if (!abilityScore) {
      return failure(`Ability '${dto.ability}' nao encontrada.`, 'INVALID_ACTION');
    }

    let modifier = abilityScore.modifier;
    let proficient = false;
    let expertise = false;

    // If a skill is specified, use the skill modifier instead
    if (dto.skill) {
      const skillBlock = sheet.skills.find(
        (s) => s.slug === dto.skill || s.name.toLowerCase() === dto.skill!.toLowerCase(),
      );
      if (skillBlock) {
        modifier = skillBlock.bonus;
        proficient = skillBlock.proficient;
        expertise = skillBlock.expertise;
      }
    }

    // Check condition effects on ability checks
    const conditions = sheet.conditions ?? [];
    const condMods = this.getAbilityCheckModifiers(conditions);

    // Determine advantage/disadvantage
    let hasAdvantage = dto.advantage ?? false;
    let hasDisadvantage = dto.disadvantage ?? false;

    if (condMods.hasDisadvantage) hasDisadvantage = true;

    // Spec 012 — Heroic Inspiration
    let inspirationEvent: GameEventData | null = null;
    if (dto.participantId) {
      const inspResult = await this.inspirationService.consumeIfArmed(
        dto.participantId,
        'ability_check',
      );
      if (inspResult.consumed && inspResult.eventData) {
        hasAdvantage = true;
        inspirationEvent = inspResult.eventData;
      }
    }
    if (condMods.autoFail) {
      return success(
        {
          ability: dto.ability,
          skill: dto.skill,
          dc: dto.dc,
          roll: 0,
          modifier,
          total: 0,
          success: false,
          proficient,
          expertise,
        },
        this.buildEvents(dto, 0, modifier, 0, false),
      );
    }

    // Roll the d20
    let roll: number;
    let advantageResult: { roll1: number; roll2: number; used: number } | undefined;

    if (hasAdvantage && !hasDisadvantage) {
      const r = this.diceService.rollWithAdvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, used: r.chosen };
    } else if (hasDisadvantage && !hasAdvantage) {
      const r = this.diceService.rollWithDisadvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, used: r.chosen };
    } else {
      roll = this.diceService.roll(20);
    }

    const total = roll + modifier;
    const passed = total >= dto.dc;

    const result: SkillCheckResult = {
      ability: dto.ability,
      skill: dto.skill,
      dc: dto.dc,
      roll,
      modifier,
      total,
      success: passed,
      proficient,
      expertise,
      advantage: advantageResult,
    };

    const events = this.buildEvents(dto, roll, modifier, total, passed);
    if (inspirationEvent) events.unshift(inspirationEvent);
    return success(result, events);
  }

  private getAbilityCheckModifiers(conditions: string[]) {
    const set = new Set(conditions);
    return {
      hasDisadvantage: set.has('poisoned') || set.has('frightened') || set.has('exhaustion'),
      autoFail:
        set.has('incapacitated') ||
        set.has('stunned') ||
        set.has('paralyzed') ||
        set.has('petrified') ||
        set.has('unconscious'),
    };
  }

  private buildEvents(
    dto: SkillCheckDto,
    roll: number,
    modifier: number,
    total: number,
    passed: boolean,
  ): GameEventData[] {
    return [
      {
        event_type: 'skill_check',
        data: {
          character_id: dto.characterId,
          ability: dto.ability,
          skill: dto.skill,
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
