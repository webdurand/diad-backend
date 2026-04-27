import { Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolver.interface";
import type {
  ActionDescriptor,
  ActionKind,
  DisabledReason,
  ParticipantContext,
} from "../../interfaces/combat-action.interfaces";
import {
  CLASS_FEATURE_CATALOG,
  type FeatureSpec,
  matchesClass,
} from "./class-feature-catalog";

/**
 * Spec 003 — enumera class features ativáveis (FULL + STUB + WRAPPER) no registry.
 *
 * Regras de `available`:
 *  - PC deve ter a classe + level mínimo
 *  - `feature_uses_used[slug] >= max` → disabledReason=NO_USES_REMAINING
 *  - Action economy: bonus/action/free/reaction respeitam flags de turno
 *  - Reactions disponíveis fora do turno se reactionUsed=false
 */
@Injectable()
export class ClassFeatureActionResolver implements ActionResolver {
  readonly kind: ActionKind = "class-feature";

  async list(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    if (ctx.type !== "pc" || !ctx.sheet) return [];
    const descriptors: ActionDescriptor[] = [];
    for (const spec of CLASS_FEATURE_CATALOG) {
      const desc = this.evaluate(spec, ctx);
      if (desc) descriptors.push(desc);
    }
    return descriptors;
  }

  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    if (ctx.type !== "pc" || !ctx.sheet) return null;
    const spec = CLASS_FEATURE_CATALOG.find((s) => s.slug === slug);
    if (!spec) return null;
    return this.evaluate(spec, ctx);
  }

  private evaluate(
    spec: FeatureSpec,
    ctx: ParticipantContext,
  ): ActionDescriptor | null {
    const { matches, classLevel } = matchesClass(spec, ctx.sheet!.classes);
    if (!matches) return null;
    if (classLevel < spec.requiredLevel) return null;

    const maxUses =
      spec.maxUsesByLevel !== undefined
        ? spec.maxUsesByLevel(classLevel)
        : undefined;
    const used = ctx.featureUsesUsed?.[spec.slug] ?? 0;
    const remaining =
      maxUses === undefined ? undefined : Math.max(0, maxUses - used);

    let available = true;
    let disabledReason: DisabledReason | undefined;

    if (this.isBlockedByCondition(ctx)) {
      available = false;
      disabledReason = "PREREQUISITE_NOT_MET";
    } else if (
      maxUses !== undefined &&
      remaining !== undefined &&
      remaining <= 0
    ) {
      available = false;
      disabledReason = "NO_USES_REMAINING";
    } else if (ctx.actionEconomy) {
      const eco = ctx.actionEconomy;
      if (spec.actionCost === "reaction") {
        if (eco.reactionUsed) {
          available = false;
          disabledReason = "REACTION_ALREADY_USED";
        }
      } else if (!eco.isOnTurn) {
        available = false;
        disabledReason = "NOT_YOUR_TURN";
      } else if (spec.actionCost === "action" && eco.actionUsed) {
        available = false;
        disabledReason = "ACTION_ALREADY_USED";
      } else if (spec.actionCost === "bonus" && eco.bonusActionUsed) {
        available = false;
        disabledReason = "BONUS_ACTION_ALREADY_USED";
      }
    }

    return {
      slug: spec.slug,
      displayName: spec.displayName,
      kind: "class-feature",
      actionCost: spec.actionCost,
      available,
      disabledReason,
      targetShape: spec.targetShape,
      targetRange: spec.targetRange,
      cost: maxUses !== undefined ? { featureUses: 1 } : undefined,
      metadata: {
        sourceClass: spec.classSlug,
        requiredLevel: spec.requiredLevel,
      },
    };
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
