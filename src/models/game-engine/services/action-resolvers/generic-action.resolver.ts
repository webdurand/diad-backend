import { Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolver.interface";
import type {
  ActionDescriptor,
  ActionKind,
  ParticipantContext,
  DisabledReason,
} from "../../interfaces/combat-action.interfaces";


@Injectable()
export class GenericActionResolver implements ActionResolver {
  readonly kind: ActionKind = "generic";

  private readonly descriptors: ReadonlyArray<
    Pick<
      ActionDescriptor,
      "slug" | "displayName" | "actionCost" | "targetShape" | "targetRange"
    >
  > = [
    {
      slug: "dodge",
      displayName: "Esquivar",
      actionCost: "action",
      targetShape: "self",
    },
    {
      slug: "dash",
      displayName: "Correr (Dash)",
      actionCost: "action",
      targetShape: "self",
    },
    {
      slug: "disengage",
      displayName: "Desengajar",
      actionCost: "action",
      targetShape: "self",
    },
    {
      slug: "help",
      displayName: "Ajudar",
      actionCost: "action",
      targetShape: "single-creature",
      targetRange: 5,
    },
    {
      slug: "hide",
      displayName: "Esconder",
      actionCost: "action",
      targetShape: "self",
    },
    {
      slug: "ready",
      displayName: "Preparar Ação",
      actionCost: "action",
      targetShape: "none",
    },
    {
      slug: "search",
      displayName: "Procurar",
      actionCost: "action",
      targetShape: "none",
    },
    {
      slug: "use-object",
      displayName: "Usar Objeto",
      actionCost: "action",
      targetShape: "none",
    },
  ];

  async list(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    return this.descriptors.map((d) => this.toDescriptor(d, ctx));
  }

  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    const found = this.descriptors.find((d) => d.slug === slug);
    if (!found) return null;
    return this.toDescriptor(found, ctx);
  }

  private toDescriptor(
    base: Pick<
      ActionDescriptor,
      "slug" | "displayName" | "actionCost" | "targetShape" | "targetRange"
    >,
    ctx: ParticipantContext,
  ): ActionDescriptor {
    const economy = ctx.actionEconomy;
    const conditionBlocked = this.isBlockedByCondition(ctx);

    let available = true;
    let disabledReason: DisabledReason | undefined;

    if (conditionBlocked) {
      available = false;
      disabledReason = "PREREQUISITE_NOT_MET";
    } else if (economy) {
      if (!economy.isOnTurn) {
        available = false;
        disabledReason = "NOT_YOUR_TURN";
      } else if (economy.actionUsed) {
        available = false;
        disabledReason = "ACTION_ALREADY_USED";
      }
    }

    return {
      ...base,
      kind: "generic",
      available,
      disabledReason,
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
