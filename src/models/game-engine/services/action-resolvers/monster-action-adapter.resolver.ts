import { Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolver.interface";
import type {
  ActionDescriptor,
  ActionKind,
  DisabledReason,
  ParticipantContext,
} from "../../interfaces/combat-action.interfaces";

/**
 * Spec 003 — adapter do monster statblock para o registry.
 *
 * Para cada entrada em `ctx.monsterActions`, gera slug
 * `<monsterSlug>-<slugified-action-name>` e expõe como `kind: 'attack'`
 * com a informação disponível (damageDice, damageType).
 */
@Injectable()
export class MonsterActionAdapterResolver implements ActionResolver {
  // Monster actions can be attacks or special abilities; `list()` returns both.
  readonly kind: ActionKind = "attack";

  async list(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    if (ctx.type !== "monster" || !ctx.monsterSlug || !ctx.monsterActions) {
      return [];
    }
    return ctx.monsterActions.map((a) => this.build(a, ctx));
  }

  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    if (ctx.type !== "monster" || !ctx.monsterSlug || !ctx.monsterActions) {
      return null;
    }
    const prefix = `${ctx.monsterSlug}-`;
    if (!slug.startsWith(prefix)) return null;
    const rest = slug.slice(prefix.length);
    const match = ctx.monsterActions.find(
      (a) => this.slugifyName(a.name) === rest,
    );
    if (!match) return null;
    return this.build(match, ctx);
  }

  private build(
    action: NonNullable<ParticipantContext["monsterActions"]>[number],
    ctx: ParticipantContext,
  ): ActionDescriptor {
    const economy = ctx.actionEconomy;
    let available = true;
    let disabledReason: DisabledReason | undefined;

    if (this.isBlockedByCondition(ctx)) {
      available = false;
      disabledReason = "PREREQUISITE_NOT_MET";
    } else if (economy) {
      if (!economy.isOnTurn) {
        available = false;
        disabledReason = "NOT_YOUR_TURN";
      } else if (economy.attacksUsedThisTurn >= economy.attacksMaxThisTurn) {
        available = false;
        disabledReason = "ACTION_ALREADY_USED";
      }
    }

    // Habilidades sem attackBonus nem damageDice são especiais (summon, aura, etc.)
    const isAttack = action.attackBonus != null || action.damageDice != null;

    return {
      slug: `${ctx.monsterSlug}-${this.slugifyName(action.name)}`,
      displayName: action.name,
      kind: isAttack ? "attack" : "special",
      actionCost: "action",
      available,
      disabledReason,
      targetShape: isAttack ? "single-creature" : "none",
      targetRange: isAttack ? 5 : undefined,
      metadata: {
        damageDice: action.damageDice,
        damageType: action.damageType,
        sourceMonsterSlug: ctx.monsterSlug,
        ...(isAttack
          ? {
              attacksRemainingThisTurn: economy
                ? Math.max(
                    0,
                    economy.attacksMaxThisTurn - economy.attacksUsedThisTurn,
                  )
                : undefined,
            }
          : {}),
      },
    };
  }

  private slugifyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private isBlockedByCondition(ctx: ParticipantContext): boolean {
    if (!ctx.conditions || ctx.conditions.length === 0) return false;
    const blocking = new Set([
      "incapacitated",
      "paralyzed",
      "stunned",
      "unconscious",
      "petrified",
    ]);
    return ctx.conditions.some((c) => blocking.has(c.toLowerCase()));
  }
}
