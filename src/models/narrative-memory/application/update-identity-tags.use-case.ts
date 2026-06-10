import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import {
  MAX_IDENTITY_HISTORY,
  MAX_IDENTITY_TAGS,
  type IdentityTagDelta,
  type PCIdentityState,
} from "../domain/narrative-memory.types";

export interface IdentityTagsRepositoryPort {
  findIdentityState(pcId: string): Promise<PCIdentityState | null>;
  saveIdentityState(pcId: string, state: PCIdentityState): Promise<void>;
}

export interface IdentityTagsEventPort {
  publishIdentityTagsChanged(input: {
    sessionId: string;
    pcId: string;
    added: string[];
    removed: string[];
    totalTagsAfter: number;
    traceId?: string;
  }): Promise<void>;
}

export interface UpdateIdentityTagsInput {
  sessionId: string;
  pcId: string;
  phaseTransitionId: string;
  added: string[];
  removed: string[];
  rationale?: string;
  traceId?: string;
}

export class UpdateIdentityTagsUseCase {
  constructor(
    private readonly deps: {
      repository: IdentityTagsRepositoryPort;
      events: IdentityTagsEventPort;
      now?: () => Date;
    },
  ) {}

  async execute(input: UpdateIdentityTagsInput): Promise<PCIdentityState> {
    const state = await this.deps.repository.findIdentityState(input.pcId);
    if (!state) {
      throw new DomainException(
        ErrorCode.CHARACTER_NOT_FOUND,
        `Personagem ${input.pcId} não encontrado.`,
      );
    }

    const added = normalizeTags(input.added);
    const removed = normalizeTags(input.removed);
    this.assertNoOverlap(added, removed);
    this.assertRemovedTagsExist(state.currentTags, removed);

    const nextTags = applyTagDelta(state.currentTags, added, removed);
    if (nextTags.length > MAX_IDENTITY_TAGS) {
      throw new DomainException(
        ErrorCode.IDENTITY_TAGS_LIMIT_EXCEEDED,
        "Tentativa de exceder 5 identity tags.",
        {
          context: {
            pcId: input.pcId,
            currentCount: state.currentTags.length,
            addedCount: added.length,
            removedCount: removed.length,
          },
          hint: "Remova tags antigas antes de adicionar novas.",
        },
      );
    }

    const delta: IdentityTagDelta = {
      added,
      removed,
      appliedAt: this.now().toISOString(),
      phaseTransitionId: input.phaseTransitionId,
      ...(input.rationale ? { rationale: input.rationale.slice(0, 200) } : {}),
    };
    const nextState: PCIdentityState = {
      currentTags: nextTags,
      history: [...state.history, delta].slice(-MAX_IDENTITY_HISTORY),
    };

    await this.deps.repository.saveIdentityState(input.pcId, nextState);
    await this.deps.events.publishIdentityTagsChanged({
      sessionId: input.sessionId,
      pcId: input.pcId,
      added,
      removed,
      totalTagsAfter: nextTags.length,
      traceId: input.traceId,
    });

    return nextState;
  }

  private assertNoOverlap(added: string[], removed: string[]): void {
    const removedSet = new Set(removed);
    const overlap = added.find((tag) => removedSet.has(tag));
    if (!overlap) return;
    throw new DomainException(
      ErrorCode.VALIDATION_INVALID_PAYLOAD,
      `Identity tag '${overlap}' não pode ser adicionada e removida no mesmo delta.`,
    );
  }

  private assertRemovedTagsExist(
    currentTags: string[],
    removed: string[],
  ): void {
    const current = new Set(currentTags);
    const missing = removed.find((tag) => !current.has(tag));
    if (!missing) return;
    throw new DomainException(
      ErrorCode.VALIDATION_INVALID_PAYLOAD,
      `Identity tag '${missing}' não existe no estado atual.`,
    );
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().replace(/\s+/g, " ");
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized.slice(0, 60));
  }
  return out;
}

function applyTagDelta(
  currentTags: string[],
  added: string[],
  removed: string[],
): string[] {
  const removedSet = new Set(removed);
  const next = currentTags.filter((tag) => !removedSet.has(tag));
  for (const tag of added) {
    if (!next.includes(tag)) next.push(tag);
  }
  return next;
}
