import type {
  ActionDescriptor,
  ActionKind,
  ParticipantContext,
} from "../../interfaces/combat-action.interfaces";

/**
 * Spec 003 — plugin interface para resolvers de ação.
 *
 * Cada resolver é responsável por um `kind` (attack/spell/class-feature/generic/...)
 * e implementa `list(ctx)` para enumerar descritores e `resolveSlug(ctx, slug)`
 * para retornar o descritor canônico de um slug específico (null se não conhece).
 *
 * O `CombatActionRegistry` itera por todos os resolvers registrados.
 */
export interface ActionResolver {
  /** Kind cobrido por este resolver — usado em métricas e filtragem. */
  readonly kind: ActionKind;

  /** Lista ações desse kind disponíveis no contexto (action economy aplicada se `ctx.actionEconomy` presente). */
  list(ctx: ParticipantContext): Promise<ActionDescriptor[]>;

  /** Busca por slug específico; `null` se o slug não pertencer a este resolver. */
  resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null>;
}

export const ACTION_RESOLVERS = Symbol("ACTION_RESOLVERS");
