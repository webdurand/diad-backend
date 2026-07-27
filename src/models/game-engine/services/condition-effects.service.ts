import { Injectable } from "@nestjs/common";
import {
  AttackModifiers,
  ConditionInstance,
  DefenseModifiers,
  SaveModifiers,
  ConditionTurnEffect,
  HelpingState,
} from "../interfaces/combat.interfaces";

export const INCAPACITATED_CONDITIONS = [
  "incapacitated",
  "stunned",
  "paralyzed",
  "petrified",
  "unconscious",
  "haste_lethargy",
  "hypnotized",
  "banished",
] as const;

export function canTakeReactionFromConditions(
  conditions: readonly string[] | null | undefined,
): boolean {
  return !(conditions ?? []).some((condition) =>
    INCAPACITATED_CONDITIONS.includes(
      condition.toLowerCase() as (typeof INCAPACITATED_CONDITIONS)[number],
    ),
  );
}

export const NO_MOVE_CONDITIONS = [
  "grappled",
  "restrained",
  "stunned",
  "paralyzed",
  "petrified",
  "unconscious",
  "haste_lethargy",
  "hypnotized",
  "banished",
] as const;

export function canMoveFromConditions(
  conditions: readonly string[] | null | undefined,
): boolean {
  return !(conditions ?? []).some((condition) =>
    NO_MOVE_CONDITIONS.includes(
      condition.toLowerCase() as (typeof NO_MOVE_CONDITIONS)[number],
    ),
  );
}

export function isTargetingCharmer(
  conditionInstances: readonly ConditionInstance[] | null | undefined,
  targetParticipantId: string,
): boolean {
  return (conditionInstances ?? []).some(
    (condition) =>
      (condition.slug === "charmed" || condition.slug === "hypnotized") &&
      condition.appliedBy === targetParticipantId,
  );
}

export interface ReactiveParticipant {
  id: string;
  conditions: string[];
  dodgingUntilTurnOfParticipantId: string | null;
}

export function hasDodgeDexSaveAdvantage(
  participant:
    | Pick<ReactiveParticipant, "id" | "dodgingUntilTurnOfParticipantId">
    | null
    | undefined,
  ability: string,
): boolean {
  return (
    ability.toLowerCase().slice(0, 3) === "dex" &&
    participant?.dodgingUntilTurnOfParticipantId === participant?.id
  );
}

export interface ReactiveAttackModifiers {
  advantage: boolean;
  disadvantage: boolean;

  consumedHelp?: boolean;

  helpingAllyParticipantId?: string;
}

export interface AbilityCheckModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
}


@Injectable()
export class ConditionEffectsService {
  getAttackModifiers(conditions: string[]): AttackModifiers {
    const set = new Set(conditions);
    return {
      hasAdvantage: set.has("invisible"),
      hasDisadvantage:
        set.has("blinded") ||
        set.has("frightened") ||
        set.has("poisoned") ||
        set.has("prone") ||
        set.has("restrained") ||
        set.has("ash_puff"),
      autoFail:
        set.has("incapacitated") ||
        set.has("stunned") ||
        set.has("paralyzed") ||
        set.has("petrified") ||
        set.has("unconscious") ||
        set.has("banished"),
      autoCrit: false,
    };
  }


  getDefenseModifiers(conditions: string[]): DefenseModifiers {
    const set = new Set(conditions);
    return {
      attacksHaveAdvantage:
        set.has("blinded") ||
        set.has("paralyzed") ||
        set.has("petrified") ||
        set.has("restrained") ||
        set.has("stunned") ||
        set.has("unconscious"),
      attacksHaveDisadvantage: set.has("invisible"),
      autoHit: false,
      autoCritIfMelee: set.has("paralyzed") || set.has("unconscious"),
    };
  }


  getSavingThrowModifiers(
    conditions: string[],
    ability: string,
  ): SaveModifiers {
    const set = new Set(conditions);
    const isStrOrDex = ability === "str" || ability === "dex";
    return {
      hasAdvantage: false,
      hasDisadvantage:
        (ability === "dex" && set.has("restrained")) ||
        set.has("ash_puff"),
      autoFail:
        isStrOrDex &&
        (set.has("paralyzed") ||
          set.has("petrified") ||
          set.has("stunned") ||
          set.has("unconscious")),
    };
  }

  getAbilityCheckModifiers(conditions: string[]): AbilityCheckModifiers {
    const set = new Set(conditions);
    return {
      hasAdvantage: false,
      hasDisadvantage:
        set.has("poisoned") ||
        set.has("frightened") ||
        set.has("ash_puff"),
      autoFail:
        set.has("incapacitated") ||
        set.has("stunned") ||
        set.has("paralyzed") ||
        set.has("petrified") ||
        set.has("unconscious"),
    };
  }


  canTakeAction(conditions: string[]): boolean {
    return canTakeReactionFromConditions(conditions);
  }


  canTakeReaction(conditions: string[]): boolean {
    return this.canTakeAction(conditions);
  }


  canMove(conditions: string[]): boolean {
    return canMoveFromConditions(conditions);
  }


  getSpeedMultiplier(conditions: string[]): number {
    if (
      !canMoveFromConditions(conditions)
    ) {
      return 0;
    }
    return 1;
  }


  getStartOfTurnEffects(conditions: string[]): ConditionTurnEffect[] {
    const effects: ConditionTurnEffect[] = [];
    const set = new Set(conditions);

    if (set.has("frightened")) {
      effects.push({
        condition: "frightened",
        effect: "check_source_visible",
        description:
          "Must check if source of fear is visible. Cannot willingly move closer.",
      });
    }

    return effects;
  }


  getEndOfTurnEffects(conditions: string[]): ConditionTurnEffect[] {
    const effects: ConditionTurnEffect[] = [];
    const set = new Set(conditions);

    if (set.has("frightened")) {
      effects.push({
        condition: "frightened",
        effect: "repeat_save",
        description: "Can repeat saving throw to end the frightened condition.",
      });
    }

    if (set.has("stunned")) {
      effects.push({
        condition: "stunned",
        effect: "repeat_save",
        description: "Can repeat saving throw to end the stunned condition.",
      });
    }

    if (set.has("charmed")) {
      effects.push({
        condition: "charmed",
        effect: "repeat_save",
        description:
          "Can repeat saving throw to end the charmed condition (if applicable).",
      });
    }

    if (set.has("restrained")) {
      effects.push({
        condition: "restrained",
        effect: "repeat_save",
        description:
          "Can attempt to break free (STR check or DEX save, depending on source).",
      });
    }

    return effects;
  }


  isBlinded(conditions: string[]): boolean {
    return conditions.includes("blinded");
  }


  isCharmed(conditions: string[]): boolean {
    return conditions.includes("charmed");
  }


  getReactiveAttackModifiers(
    attacker: ReactiveParticipant,
    target: ReactiveParticipant,
    ctx?: { helpingAgainst?: HelpingState },
  ): ReactiveAttackModifiers {
    const out: ReactiveAttackModifiers = {
      advantage: false,
      disadvantage: false,
    };





    const attackerBlinded =
      attacker.conditions.includes("blinded") ||
      attacker.conditions.includes("unconscious") ||
      attacker.conditions.includes("petrified");
    const attackerIncapacitated =
      attacker.conditions.includes("incapacitated") ||
      attacker.conditions.includes("stunned") ||
      attacker.conditions.includes("paralyzed") ||
      attacker.conditions.includes("unconscious") ||
      attacker.conditions.includes("petrified");

    if (
      target.dodgingUntilTurnOfParticipantId === target.id &&
      !attackerBlinded &&
      !attackerIncapacitated
    ) {
      out.disadvantage = true;
    }


    if (attacker.conditions.includes("hidden")) {
      out.advantage = true;
    }
    if (target.conditions.includes("hidden")) {
      out.disadvantage = true;
    }


    const help = ctx?.helpingAgainst;
    if (
      help &&
      help.allyParticipantId === attacker.id &&
      help.targetParticipantId === target.id
    ) {
      out.advantage = true;
      out.consumedHelp = true;
      out.helpingAllyParticipantId = help.allyParticipantId;
    }

    return out;
  }


  getConditionSummary(conditions: string[]): string[] {
    const summaries: string[] = [];
    const set = new Set(conditions);

    if (set.has("blinded"))
      summaries.push(
        "Blinded: Disadvantage on attacks, attacks against have advantage.",
      );
    if (set.has("charmed"))
      summaries.push(
        "Charmed: Can't attack the charmer. Charmer has advantage on social checks.",
      );
    if (set.has("deafened"))
      summaries.push(
        "Deafened: Can't hear. Automatically fails hearing-based checks.",
      );
    if (set.has("frightened"))
      summaries.push(
        "Frightened: Disadvantage on ability checks and attacks while source is visible. Can't move closer.",
      );
    if (set.has("grappled")) summaries.push("Grappled: Speed is 0.");
    if (set.has("incapacitated"))
      summaries.push("Incapacitated: Can't take actions or reactions.");
    if (set.has("invisible"))
      summaries.push(
        "Invisible: Advantage on attacks, attacks against have disadvantage.",
      );
    if (set.has("paralyzed"))
      summaries.push(
        "Paralyzed: Incapacitated. Auto-fail STR/DEX saves. Attacks have advantage. Melee hits are auto-crits.",
      );
    if (set.has("petrified"))
      summaries.push(
        "Petrified: Incapacitated. Auto-fail STR/DEX saves. Resistance to all damage. Immune to poison/disease.",
      );
    if (set.has("poisoned"))
      summaries.push(
        "Poisoned: Disadvantage on attack rolls and ability checks.",
      );
    if (set.has("prone"))
      summaries.push(
        "Prone: Disadvantage on attacks. Melee attacks against have advantage, ranged have disadvantage. Standing costs half movement.",
      );
    if (set.has("restrained"))
      summaries.push(
        "Restrained: Speed 0. Disadvantage on attacks and DEX saves. Attacks against have advantage.",
      );
    if (set.has("stunned"))
      summaries.push(
        "Stunned: Incapacitated. Auto-fail STR/DEX saves. Attacks against have advantage.",
      );
    if (set.has("unconscious"))
      summaries.push(
        "Unconscious: Incapacitated, drops prone. Auto-fail STR/DEX saves. Attacks have advantage. Melee auto-crits.",
      );
    if (set.has("ash_puff"))
      summaries.push(
        "Ash Puff: Disadvantage on attack rolls, saving throws, and ability checks.",
      );

    return summaries;
  }
}
