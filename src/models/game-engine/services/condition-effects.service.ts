import { Injectable } from '@nestjs/common';
import {
  AttackModifiers,
  DefenseModifiers,
  SaveModifiers,
  ConditionTurnEffect,
} from '../interfaces/combat.interfaces';

/**
 * Encodes mechanical effects of the 15 SRD conditions.
 * Pure logic — no DB, no side effects.
 *
 * Conditions: blinded, charmed, deafened, exhaustion, frightened,
 * grappled, incapacitated, invisible, paralyzed, petrified,
 * poisoned, prone, restrained, stunned, unconscious
 */
@Injectable()
export class ConditionEffectsService {
  private static readonly INCAPACITATED_CONDITIONS = [
    'incapacitated',
    'stunned',
    'paralyzed',
    'petrified',
    'unconscious',
  ];

  private static readonly NO_MOVE_CONDITIONS = [
    'grappled',
    'restrained',
    'stunned',
    'paralyzed',
    'petrified',
    'unconscious',
  ];

  /**
   * How conditions affect the attacker's rolls.
   */
  getAttackModifiers(conditions: string[]): AttackModifiers {
    const set = new Set(conditions);
    return {
      hasAdvantage: set.has('invisible'),
      hasDisadvantage:
        set.has('blinded') ||
        set.has('frightened') ||
        set.has('poisoned') ||
        set.has('prone') ||
        set.has('restrained'),
      autoFail:
        set.has('incapacitated') ||
        set.has('stunned') ||
        set.has('paralyzed') ||
        set.has('petrified') ||
        set.has('unconscious'),
      autoCrit: false,
    };
  }

  /**
   * How conditions on the defender affect incoming attacks.
   */
  getDefenseModifiers(conditions: string[]): DefenseModifiers {
    const set = new Set(conditions);
    return {
      attacksHaveAdvantage:
        set.has('blinded') ||
        set.has('paralyzed') ||
        set.has('petrified') ||
        set.has('restrained') ||
        set.has('stunned') ||
        set.has('unconscious'),
      attacksHaveDisadvantage: set.has('invisible'),
      autoHit: false,
      autoCritIfMelee:
        set.has('paralyzed') || set.has('unconscious'),
    };
  }

  /**
   * How conditions affect saving throws.
   */
  getSavingThrowModifiers(
    conditions: string[],
    ability: string,
  ): SaveModifiers {
    const set = new Set(conditions);
    const isStrOrDex = ability === 'str' || ability === 'dex';
    return {
      hasAdvantage: false,
      hasDisadvantage: false,
      autoFail:
        isStrOrDex &&
        (set.has('paralyzed') ||
          set.has('petrified') ||
          set.has('stunned') ||
          set.has('unconscious')),
    };
  }

  /**
   * Can the creature take actions?
   */
  canTakeAction(conditions: string[]): boolean {
    return !conditions.some((c) =>
      ConditionEffectsService.INCAPACITATED_CONDITIONS.includes(c),
    );
  }

  /**
   * Can the creature take reactions?
   */
  canTakeReaction(conditions: string[]): boolean {
    return this.canTakeAction(conditions);
  }

  /**
   * Can the creature move?
   */
  canMove(conditions: string[]): boolean {
    return !conditions.some((c) =>
      ConditionEffectsService.NO_MOVE_CONDITIONS.includes(c),
    );
  }

  /**
   * Speed multiplier from conditions.
   * Prone: standing costs half movement (handled by movement system, not multiplier).
   * Exhaustion level effects are handled separately via exhaustion_level field.
   */
  getSpeedMultiplier(conditions: string[]): number {
    if (
      conditions.some((c) =>
        ConditionEffectsService.NO_MOVE_CONDITIONS.includes(c),
      )
    ) {
      return 0;
    }
    return 1;
  }

  /**
   * Effects that trigger at the start of a creature's turn.
   */
  getStartOfTurnEffects(conditions: string[]): ConditionTurnEffect[] {
    const effects: ConditionTurnEffect[] = [];
    const set = new Set(conditions);

    if (set.has('frightened')) {
      effects.push({
        condition: 'frightened',
        effect: 'check_source_visible',
        description:
          'Must check if source of fear is visible. Cannot willingly move closer.',
      });
    }

    return effects;
  }

  /**
   * Effects that trigger at the end of a creature's turn.
   */
  getEndOfTurnEffects(conditions: string[]): ConditionTurnEffect[] {
    const effects: ConditionTurnEffect[] = [];
    const set = new Set(conditions);

    if (set.has('frightened')) {
      effects.push({
        condition: 'frightened',
        effect: 'repeat_save',
        description: 'Can repeat saving throw to end the frightened condition.',
      });
    }

    if (set.has('stunned')) {
      effects.push({
        condition: 'stunned',
        effect: 'repeat_save',
        description: 'Can repeat saving throw to end the stunned condition.',
      });
    }

    if (set.has('charmed')) {
      effects.push({
        condition: 'charmed',
        effect: 'repeat_save',
        description:
          'Can repeat saving throw to end the charmed condition (if applicable).',
      });
    }

    if (set.has('restrained')) {
      effects.push({
        condition: 'restrained',
        effect: 'repeat_save',
        description:
          'Can attempt to break free (STR check or DEX save, depending on source).',
      });
    }

    return effects;
  }

  /**
   * Check if the creature is blinded.
   */
  isBlinded(conditions: string[]): boolean {
    return conditions.includes('blinded');
  }

  /**
   * Check if the creature is charmed.
   */
  isCharmed(conditions: string[]): boolean {
    return conditions.includes('charmed');
  }

  /**
   * Get a human-readable summary of all active condition effects.
   */
  getConditionSummary(conditions: string[]): string[] {
    const summaries: string[] = [];
    const set = new Set(conditions);

    if (set.has('blinded'))
      summaries.push(
        'Blinded: Disadvantage on attacks, attacks against have advantage.',
      );
    if (set.has('charmed'))
      summaries.push(
        "Charmed: Can't attack the charmer. Charmer has advantage on social checks.",
      );
    if (set.has('deafened'))
      summaries.push(
        "Deafened: Can't hear. Automatically fails hearing-based checks.",
      );
    if (set.has('frightened'))
      summaries.push(
        "Frightened: Disadvantage on ability checks and attacks while source is visible. Can't move closer.",
      );
    if (set.has('grappled'))
      summaries.push('Grappled: Speed is 0.');
    if (set.has('incapacitated'))
      summaries.push(
        "Incapacitated: Can't take actions or reactions.",
      );
    if (set.has('invisible'))
      summaries.push(
        'Invisible: Advantage on attacks, attacks against have disadvantage.',
      );
    if (set.has('paralyzed'))
      summaries.push(
        'Paralyzed: Incapacitated. Auto-fail STR/DEX saves. Attacks have advantage. Melee hits are auto-crits.',
      );
    if (set.has('petrified'))
      summaries.push(
        'Petrified: Incapacitated. Auto-fail STR/DEX saves. Resistance to all damage. Immune to poison/disease.',
      );
    if (set.has('poisoned'))
      summaries.push(
        'Poisoned: Disadvantage on attack rolls and ability checks.',
      );
    if (set.has('prone'))
      summaries.push(
        'Prone: Disadvantage on attacks. Melee attacks against have advantage, ranged have disadvantage. Standing costs half movement.',
      );
    if (set.has('restrained'))
      summaries.push(
        'Restrained: Speed 0. Disadvantage on attacks and DEX saves. Attacks against have advantage.',
      );
    if (set.has('stunned'))
      summaries.push(
        'Stunned: Incapacitated. Auto-fail STR/DEX saves. Attacks against have advantage.',
      );
    if (set.has('unconscious'))
      summaries.push(
        'Unconscious: Incapacitated, drops prone. Auto-fail STR/DEX saves. Attacks have advantage. Melee auto-crits.',
      );

    return summaries;
  }
}
