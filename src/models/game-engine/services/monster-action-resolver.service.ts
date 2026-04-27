import { Injectable, Logger } from "@nestjs/common";

/**
 * Single source of truth for resolving a monster's statblock action into
 * concrete combat mechanics: attack bonus, damage dice, damage type, range.
 *
 * Resolution order (strongest → weakest signal):
 *   1. structured `attack_bonus` field on the action (SRD import)
 *   2. `+X to hit` regex over `desc`
 *   3. fallback `0` with a warning (indicates missing/corrupt data)
 *
 * Both `CombatService.buildMonsterActionBlock` (turn-actions UI) and
 * `CombatService.resolveAttack` (actual roll) MUST use this resolver
 * so the number shown and the number rolled never diverge.
 */

export interface ResolvedMonsterAction {
  name: string;
  attackBonus: number;
  hasAttack: boolean;
  damageDice?: string;
  damageType?: string;
  damageBonus: number;
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

    const reach = monsterAction?.reach
      ? `${monsterAction.reach} ft.`
      : reachMatch
        ? `${reachMatch[1]} ft.`
        : undefined;
    const range = rangeMatch
      ? `${rangeMatch[1]}/${rangeMatch[2] ?? rangeMatch[1]} ft.`
      : undefined;

    return {
      name,
      attackBonus,
      hasAttack: source !== "none",
      damageDice,
      damageType,
      damageBonus: 0,
      range,
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
