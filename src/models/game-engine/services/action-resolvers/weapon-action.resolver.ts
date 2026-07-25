import { Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolver.interface";
import type {
  ActionDescriptor,
  ActionKind,
  DisabledReason,
  ParticipantContext,
  ResolverSheetSlice,
} from "../../interfaces/combat-action.interfaces";


@Injectable()
export class WeaponActionResolver implements ActionResolver {
  readonly kind: ActionKind = "attack";

  async list(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    if (ctx.type === "monster") return [];
    if (!ctx.sheet) return [];
    return ctx.sheet.equipment
      .filter((eq) => eq.equipped && this.hasDamage(eq))
      .map((eq) => this.build(eq, ctx));
  }

  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    if (ctx.type === "monster") return null;
    if (!slug.endsWith("-attack")) return null;
    const equipSlug = slug.slice(0, -"-attack".length);
    if (!ctx.sheet) return null;
    const eq = ctx.sheet.equipment.find(
      (e) => e.slug === equipSlug && e.equipped && this.hasDamage(e),
    );
    if (!eq) return null;
    return this.build(eq, ctx);
  }

  private build(
    eq: ResolverSheetSlice["equipment"][number],
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
      } else if (
        economy.attacksUsedThisTurn >= economy.attacksMaxThisTurn ||
        (economy.actionUsed && economy.attacksUsedThisTurn === 0)
      ) {
        available = false;
        disabledReason = "ACTION_ALREADY_USED";
      }
    }

    const damageInfo = this.extractDamage(eq);
    const isRanged = this.isRanged(eq);

    return {
      slug: `${eq.slug}-attack`,
      displayName: `Ataque com ${eq.name}`,
      kind: "attack",
      actionCost: "action",
      available,
      disabledReason,
      targetShape: "single-creature",
      targetRange: isRanged ? 60 : 5,
      metadata: {
        damageDice: damageInfo?.dice,
        damageType: damageInfo?.type,
        sourceEquipmentId: eq.id,
        attacksRemainingThisTurn: economy
          ? Math.max(
              0,
              economy.attacksMaxThisTurn - economy.attacksUsedThisTurn,
            )
          : undefined,
      },
    };
  }

  private hasDamage(eq: ResolverSheetSlice["equipment"][number]): boolean {
    return !!eq.damage && typeof eq.damage === "object";
  }

  private extractDamage(
    eq: ResolverSheetSlice["equipment"][number],
  ): { dice?: string; type?: string } | undefined {
    const d = eq.damage as
      | {
          damage_dice?: string;
          damage_type?: string | { slug?: string; name?: string };
        }
      | undefined;
    if (!d) return undefined;
    const type =
      typeof d.damage_type === "string"
        ? d.damage_type
        : (d.damage_type?.slug ?? d.damage_type?.name);
    return { dice: d.damage_dice, type };
  }

  private isRanged(eq: ResolverSheetSlice["equipment"][number]): boolean {
    const r = eq.range as { normal?: number } | undefined;
    return !!r?.normal && r.normal > 5;
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
