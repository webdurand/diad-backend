/**
 * Spec 020 — Scene Context Redaction Filter (AI3 leak fix).
 *
 * Stripa campos sensíveis (descriptionHidden, personalityBig5, knowledgeScope)
 * antes de retornar NpcEntity para o agent. Bypass apenas via header
 * X-DIAD-Role=dm-omniscient (modo debug humano).
 *
 * Princípio II + X: fog of war é state mecânico explícito. LLM tem acesso
 * APENAS ao que o jogador descobriu.
 */

import { NpcEntity } from "src/entities/npc.entity";

export interface NpcProjectionOptions {
  /** true = libera todos os campos (header X-DIAD-Role=dm-omniscient) */
  dmOmniscient?: boolean;
  /** knowledge keys já reveladas pra party (libera motivation/voiceNotes) */
  knownKeys?: ReadonlySet<string>;
}

export type ProjectedNpc = Omit<
  NpcEntity,
  "descriptionHidden" | "personalityBig5" | "knowledgeScope"
> & {
  descriptionHidden?: string;
  personalityBig5?: NpcEntity["personalityBig5"];
  knowledgeScope?: string[];
  motivation?: string;
  voiceNotes?: string;
  dialogueStyle?: string;
};

const PERSONALITY_KNOWN_KEY = "personality_revealed";
const VOICE_KNOWN_KEY = "voice_known";
const MOTIVATION_KNOWN_KEY = "motivation_revealed";

export function projectNpc(
  npc: NpcEntity,
  options: NpcProjectionOptions = {},
): ProjectedNpc {
  if (options.dmOmniscient) {
    return { ...npc };
  }

  const known = options.knownKeys ?? new Set<string>();
  const projected: ProjectedNpc = { ...npc };

  delete (projected as { descriptionHidden?: string }).descriptionHidden;
  delete (projected as { knowledgeScope?: string[] }).knowledgeScope;

  if (!known.has(PERSONALITY_KNOWN_KEY)) {
    delete (projected as { personalityBig5?: unknown }).personalityBig5;
  }
  if (!known.has(MOTIVATION_KNOWN_KEY)) {
    delete (projected as { motivation?: string }).motivation;
  }
  if (!known.has(VOICE_KNOWN_KEY)) {
    delete (projected as { voiceNotes?: string }).voiceNotes;
    delete (projected as { dialogueStyle?: string }).dialogueStyle;
  }

  return projected;
}

export function projectNpcs(
  npcs: NpcEntity[],
  options: NpcProjectionOptions = {},
): ProjectedNpc[] {
  return npcs.map((n) => projectNpc(n, options));
}

export function isDmOmniscient(headers: Record<string, unknown>): boolean {
  const raw =
    (headers["x-diad-role"] as string | undefined) ??
    (headers["X-DIAD-Role"] as string | undefined);
  return typeof raw === "string" && raw.toLowerCase() === "dm-omniscient";
}
