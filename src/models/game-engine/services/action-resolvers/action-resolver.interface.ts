import type {
  ActionDescriptor,
  ActionKind,
  ParticipantContext,
} from "../../interfaces/combat-action.interfaces";


export interface ActionResolver {

  readonly kind: ActionKind;


  list(ctx: ParticipantContext): Promise<ActionDescriptor[]>;


  resolveSlug(
    ctx: ParticipantContext,
    slug: string,
  ): Promise<ActionDescriptor | null>;
}

export const ACTION_RESOLVERS = Symbol("ACTION_RESOLVERS");
