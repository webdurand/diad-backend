import { Injectable, Logger } from "@nestjs/common";



export interface ResolvedMonsterAction {
  name: string;
  attackBonus: number;
  hasAttack: boolean;
  damageDice?: string;
  damageType?: string;
  damageBonus: number;
  onHitCondition?: {
    slug: "restrained";
    saveAbility?: "str";
    saveDc?: number;
  };
  onHitSaveCondition?: {
    slug: "paralyzed" | "frightened";
    saveAbility: "con" | "wis";
    saveDc: number;
    durationRounds: number | null;
    expiresAtTurnEndParticipantId?: string | null;
    repeatSaveTiming: "end_of_turn" | "never";
    excludedCreatureTypes: string[];
    excludedRaceTerms: string[];
  };
  saveConditionAction?: {
    slug: "charmed" | "frightened";
    saveAbility: "wis";
    saveDc: number;
    rangeFt: number;
    durationRounds: number | null;
    repeatSaveTiming: "end_of_turn" | "never";
  };
  secondarySaveDamage?: {
    saveAbility: "str" | "dex" | "con" | "int" | "wis" | "cha";
    saveDc: number;
    damageDice: string;
    damageType: string;
    halfOnSuccess: boolean;
    zeroHpEffect?: {
      stable: boolean;
      conditions: Array<"poisoned" | "paralyzed">;
      durationRounds: number;
    };
  };
  range?: string;
  reach?: string;
  description: string;
  attackBonusSource: "structured" | "regex" | "fallback" | "none";
}

@Injectable()
export class MonsterActionResolver {
  private readonly logger = new Logger(MonsterActionResolver.name);

  resolve(monsterAction: any, monsterName = "unknown"): ResolvedMonsterAction {
    const name: string = monsterAction?.name ?? "Ataque";
    const desc: string = monsterAction?.desc ?? "";
    const structuredBonus: number | undefined =
      typeof monsterAction?.attack_bonus === "number"
        ? monsterAction.attack_bonus
        : undefined;

    const regexMatch = desc.match(/([+-]?\d+)\s*to hit/i);
    const regexBonus = regexMatch ? parseInt(regexMatch[1], 10) : undefined;

    const looksLikeAttack =
      /to hit|attack roll/i.test(desc) || structuredBonus !== undefined;

    let attackBonus = 0;
    let source: ResolvedMonsterAction["attackBonusSource"] = "none";

    if (structuredBonus !== undefined) {
      attackBonus = structuredBonus;
      source = "structured";
    } else if (regexBonus !== undefined) {
      attackBonus = regexBonus;
      source = "regex";
    } else if (looksLikeAttack) {
      source = "fallback";
      this.logger.warn(
        `MonsterActionResolver fallback: ${monsterName}/${name} has no attack_bonus and no "+X to hit" in desc. Using 0.`,
      );
    }

    const dmg = Array.isArray(monsterAction?.damage)
      ? monsterAction.damage[0]
      : undefined;
    const damageMatch = desc.match(/\(([^)]+)\)\s+(\w+)\s+damage/i);

    const damageDice: string | undefined =
      dmg?.damage_dice ?? (damageMatch ? damageMatch[1].trim() : undefined);
    const damageType: string | undefined =
      dmg?.damage_type?.name?.toLowerCase?.() ??
      (damageMatch ? damageMatch[2].toLowerCase() : undefined);

    const reachMatch = desc.match(/reach\s+(\d+)\s*ft/i);
    const rangeMatch = desc.match(/range\s+(\d+)(?:\/(\d+))?\s*ft/i);
    const withinMatch = desc.match(/within\s+(\d+)\s*(?:feet|ft\.?)/i);

    const reach = monsterAction?.reach
      ? `${monsterAction.reach} ft.`
      : reachMatch
        ? `${reachMatch[1]} ft.`
        : undefined;
    const range = rangeMatch
      ? `${rangeMatch[1]}/${rangeMatch[2] ?? rangeMatch[1]} ft.`
      : undefined;

    const restrainedOnHit =
      /Hit:\s*The target is restrained\b/i.test(desc);
    const escapeCheck = desc.match(
      /DC\s+(\d+)\s+Strength\s+check\b/i,
    );
    const onHitCondition = restrainedOnHit
      ? {
          slug: "restrained" as const,
          saveAbility: "str" as const,
          saveDc: escapeCheck ? parseInt(escapeCheck[1], 10) : undefined,
        }
      : undefined;

    const paralyzedSaveMatch = desc.match(
      /must succeed on a DC\s+(\d+)\s+Constitution saving throw or be paralyzed for\s+(\d+)\s+minute/i,
    );
    const onHitSaveCondition = paralyzedSaveMatch
      ? {
          slug: "paralyzed" as const,
          saveAbility: "con" as const,
          saveDc: parseInt(paralyzedSaveMatch[1], 10),
          durationRounds: parseInt(paralyzedSaveMatch[2], 10) * 10,
          repeatSaveTiming:
            /repeat the saving throw at the end of each of its turns/i.test(desc)
              ? ("end_of_turn" as const)
              : ("never" as const),
          excludedCreatureTypes: /other than an elf or undead/i.test(desc)
            ? ["undead"]
            : [],
          excludedRaceTerms: /other than an elf or undead/i.test(desc)
            ? ["elf"]
            : [],
        }
      : undefined;

    const directWisdomSave = desc.match(
      /DC\s+(\d+)\s+Wisdom\s+saving throw/i,
    );
    const directCondition: "charmed" | "frightened" | null =
      /\bbecome(?:s)?\s+(?:magically\s+)?frightened\b/i.test(desc)
        ? "frightened"
        : /\b(?:be|become(?:s)?)\s+(?:magically\s+)?charmed\b/i.test(desc)
          ? "charmed"
          : null;
    const directRange =
      Number(withinMatch?.[1] ?? rangeMatch?.[1] ?? reachMatch?.[1] ?? 0) || 5;
    const minuteDuration = desc.match(
      /(?:charmed|frightened)(?:[^.]{0,80})for\s+(\d+)\s+minute/i,
    );
    const hourDuration = desc.match(
      /(?:charmed|frightened)(?:[^.]{0,80})for\s+(\d+)\s+hour/i,
    );
    const saveConditionAction =
      !looksLikeAttack && directWisdomSave && directCondition
        ? {
            slug: directCondition,
            saveAbility: "wis" as const,
            saveDc: Number(directWisdomSave[1]),
            rangeFt: directRange,
            durationRounds: minuteDuration
              ? Number(minuteDuration[1]) * 10
              : hourDuration
                ? Number(hourDuration[1]) * 600
                : null,
            repeatSaveTiming:
              /repeat the saving throw at the end of each of its turns/i.test(
                desc,
              )
                ? ("end_of_turn" as const)
                : ("never" as const),
          }
        : undefined;

    const secondarySaveDamageMatch = desc.match(
      /DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw,\s*taking\s+\d+\s+\(([^)]+)\)\s+([a-z]+)\s+damage on a failed save,\s*or half as much damage on a successful one/i,
    );
    const abilitySlugs = {
      strength: "str",
      dexterity: "dex",
      constitution: "con",
      intelligence: "int",
      wisdom: "wis",
      charisma: "cha",
    } as const;
    const secondarySaveDamage = secondarySaveDamageMatch
      ? {
          saveAbility:
            abilitySlugs[
              secondarySaveDamageMatch[2].toLowerCase() as keyof typeof abilitySlugs
            ],
          saveDc: parseInt(secondarySaveDamageMatch[1], 10),
          damageDice: secondarySaveDamageMatch[3].replace(/\s+/g, ""),
          damageType: secondarySaveDamageMatch[4].toLowerCase(),
          halfOnSuccess: true,
          ...(new RegExp(
            "poison damage reduces the target to 0 hit points.*stable but poisoned for 1 hour.*paralyzed while poisoned",
            "is",
          ).test(desc)
            ? {
                zeroHpEffect: {
                  stable: true,
                  conditions: ["poisoned", "paralyzed"] as Array<
                    "poisoned" | "paralyzed"
                  >,
                  durationRounds: 600,
                },
              }
            : {}),
        }
      : undefined;

    return {
      name,
      attackBonus,
      hasAttack: source !== "none",
      damageDice,
      damageType,
      damageBonus: 0,
      onHitCondition,
      onHitSaveCondition,
      saveConditionAction,
      secondarySaveDamage,
      range:
        range ??
        (saveConditionAction
          ? `${saveConditionAction.rangeFt} ft.`
          : undefined),
      reach,
      description: desc,
      attackBonusSource: source,
    };
  }

  resolveByName(
    monster: { name?: string; actions?: any },
    actionName: string,
  ): ResolvedMonsterAction | null {
    const actions = Array.isArray(monster?.actions) ? monster.actions : [];
    const action = actions.find(
      (a: any) => a?.name?.toLowerCase?.() === actionName.toLowerCase(),
    );
    if (!action) return null;
    return this.resolve(action, monster?.name);
  }
}
