import { Inject, Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolvers/action-resolver.interface";
import { ACTION_RESOLVERS } from "./action-resolvers/action-resolver.interface";
import type {
  ActionDescriptor,
  ParticipantContext,
} from "../interfaces/combat-action.interfaces";

/**
 * Spec 003 — Central Combat Action Registry.
 *
 * Consulta resolvers plugáveis (weapon, unarmed, generic, class-feature, monster-action)
 * e agrega `ActionDescriptor[]` para endpoints:
 *   - GET /characters/:id/combat-actions
 *   - GET /encounters/:id/participants/:pid/actions
 *   - POST /attack (resolve slug → ação concreta)
 *   - POST /generic-action (valida kind contra o que o participant pode executar)
 */
@Injectable()
export class CombatActionRegistry {
  constructor(
    @Inject(ACTION_RESOLVERS)
    private readonly resolvers: readonly ActionResolver[],
  ) {}

  /**
   * Lista todas as ações de `ctx` (união de todos os resolvers).
   * Ordenação: kind (attack → spell → class-feature → item → generic), depois displayName A-Z.
   */
  async listActions(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    const lists = await Promise.all(this.resolvers.map((r) => r.list(ctx)));
    const flat = lists.flat();
    return this.sort(flat);
  }

  /**
   * Resolve slug consultando cada resolver. Retorna o primeiro match ou null.
   * O catálogo retornado por `listActions` já bate com `resolveSlug` — mesmo shape.
   */
  async resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null> {
    for (const resolver of this.resolvers) {
      const found = await resolver.resolveSlug(ctx, slug);
      if (found) return found;
    }
    return null;
  }

  /**
   * Retorna apenas slugs disponíveis atualmente (available: true) — útil para payloads de erro.
   */
  async listAvailableSlugs(ctx: ParticipantContext): Promise<string[]> {
    const all = await this.listActions(ctx);
    return all.filter((a) => a.available).map((a) => a.slug);
  }

  private sort(descriptors: ActionDescriptor[]): ActionDescriptor[] {
    const kindOrder: Record<string, number> = {
      attack: 0,
      spell: 1,
      "class-feature": 2,
      item: 3,
      generic: 4,
    };
    return [...descriptors].sort((a, b) => {
      const dk = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
      if (dk !== 0) return dk;
      return a.displayName.localeCompare(b.displayName, "pt-BR");
    });
  }
}
