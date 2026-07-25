import { Injectable } from "@nestjs/common";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { DiceService } from "./dice.service";
import { ConditionEffectsService } from "./condition-effects.service";
import { EventService } from "./event.service";
import { InspirationService } from "./inspiration.service";
import { ExhaustionService } from "./exhaustion.service";
import {
  hasHalflingLuck,
  rollD20TestWithHalflingLuck,
  type HalflingLuckReroll,
} from "./halfling-luck";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";



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
  halflingLuckRerolls?: HalflingLuckReroll[];
}



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
    private readonly exhaustionService: ExhaustionService,
  ) {}

  async rollAbilityCheck(
    dto: SkillCheckDto,
  ): Promise<GameResult<SkillCheckResult>> {
    const sheet = await this.sheetService.computeSheet(
      dto.userId,
      dto.characterId,
    );
    if (!sheet) {
      return failure("Personagem nao encontrado.", "INVALID_PARTICIPANT");
    }


    const abilityScore = sheet.abilityScores.find(
      (a) =>
        a.slug === dto.ability ||
        a.name.toLowerCase() === dto.ability.toLowerCase(),
    );
    if (!abilityScore) {
      return failure(
        `Ability '${dto.ability}' nao encontrada.`,
        "INVALID_ACTION",
      );
    }

    let modifier = abilityScore.modifier;
    let proficient = false;
    let expertise = false;


    if (dto.skill) {
      const skillBlock = sheet.skills.find(
        (s) =>
          s.slug === dto.skill ||
          s.name.toLowerCase() === dto.skill!.toLowerCase(),
      );
      if (skillBlock) {
        proficient = skillBlock.proficient;
        expertise = skillBlock.expertise;
        const requestedAbility = abilityScore.slug.toLowerCase();
        const canonicalAbility = skillBlock.ability.toLowerCase();
        if (requestedAbility === canonicalAbility) {
          modifier = skillBlock.bonus;
        } else {
          // D&D allows a skill to be paired with a non-canonical ability
          // (for example, Wisdom (Investigation)). In that case, keep the
          // skill's proficiency/expertise but use the requested ability mod.
          const proficiencyMultiplier =
            (proficient ? 1 : 0) + (expertise ? 1 : 0);
          modifier =
            abilityScore.modifier +
            sheet.proficiencyBonus * proficiencyMultiplier;
        }
      }
    }


    const conditions = sheet.conditions ?? [];
    const condMods = this.getAbilityCheckModifiers(conditions);



    const exhLevel =
      (sheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
    const exhMods =
      exhLevel > 0
        ? this.exhaustionService.getModifiers(exhLevel, "2024_ten_levels")
        : null;
    const exhaustionD20Penalty = exhMods?.d20Penalty ?? 0;


    let hasAdvantage = dto.advantage ?? false;
    let hasDisadvantage = dto.disadvantage ?? false;

    if (condMods.hasDisadvantage) hasDisadvantage = true;


    let inspirationEvent: GameEventData | null = null;
    if (dto.participantId) {
      const inspResult = await this.inspirationService.consumeIfArmed(
        dto.participantId,
        "ability_check",
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


    const d20Test = rollD20TestWithHalflingLuck({
      enabled: hasHalflingLuck(sheet),
      advantage: hasAdvantage && !hasDisadvantage,
      disadvantage: hasDisadvantage && !hasAdvantage,
      roll: () => this.diceService.roll(20),
    });
    const roll = d20Test.chosen;
    const advantageResult = d20Test.advantage
      ? {
          roll1: d20Test.advantage.roll1,
          roll2: d20Test.advantage.roll2,
          used: d20Test.advantage.chosen,
        }
      : undefined;

    const total = roll + modifier + exhaustionD20Penalty;
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
      halflingLuckRerolls: d20Test.rerolls,
    };

    const events = this.buildEvents(dto, roll, modifier, total, passed);
    if (inspirationEvent) events.unshift(inspirationEvent);
    if (exhaustionD20Penalty !== 0) {
      events.push({
        event_type: "exhaustion_penalty_applied",
        data: {
          kind: "ability_check",
          level: exhLevel,
          d20Penalty: exhaustionD20Penalty,
          rawRoll: roll,
          modifier,
          finalTotal: total,
        },
      });
    }
    return success(result, events);
  }

  private getAbilityCheckModifiers(conditions: string[]) {
    const set = new Set(conditions);
    return {


      hasDisadvantage: set.has("poisoned") || set.has("frightened"),
      autoFail:
        set.has("incapacitated") ||
        set.has("stunned") ||
        set.has("paralyzed") ||
        set.has("petrified") ||
        set.has("unconscious"),
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
        event_type: "skill_check",
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
