import { Inject, Injectable } from "@nestjs/common";
import type { ActionResolver } from "./action-resolvers/action-resolver.interface";
import { ACTION_RESOLVERS } from "./action-resolvers/action-resolver.interface";
import type {
  ActionDescriptor,
  ParticipantContext,
} from "../interfaces/combat-action.interfaces";


@Injectable()
export class CombatActionRegistry {
  constructor(
    @Inject(ACTION_RESOLVERS)
    private readonly resolvers: readonly ActionResolver[],
  ) {}


  async listActions(ctx: ParticipantContext): Promise<ActionDescriptor[]> {
    const lists = await Promise.all(this.resolvers.map((r) => r.list(ctx)));
    const flat = lists.flat();
    return this.sort(flat);
  }


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
