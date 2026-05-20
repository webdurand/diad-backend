import { Injectable } from "@nestjs/common";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type { MetaQueryIntentCategory } from "src/entities/meta-query-audit.entity";
import type {
  MetaQueryAllowedFact,
  MetaQueryFactKind,
} from "./meta-query-fact-resolver.service";

export interface MetaQueryInspection {
  intentCategory: MetaQueryIntentCategory;
  allowedFactSet: MetaQueryAllowedFact[];
  filteredFactsCount: number;
}

const STOP_WORDS = new Set([
  "qual",
  "quais",
  "como",
  "posso",
  "pode",
  "para",
  "sobre",
  "essa",
  "esse",
  "isso",
  "aqui",
  "agora",
  "minha",
  "meu",
  "dele",
  "dela",
  "the",
  "what",
  "which",
  "can",
  "this",
  "that",
  "with",
]);
const SHORT_SIGNAL_TOKENS = new Set(["hp", "ac", "dc"]);

const INTENT_FACT_KINDS: Record<MetaQueryIntentCategory, MetaQueryFactKind[]> = {
  rule_query: ["rule_reference", "pc_capability"],
  perception_query: ["scene_observation", "npc_public", "pc_capability"],
  tactical_query: [
    "pc_capability",
    "scene_observation",
    "npc_public",
    "lore",
    "rule_reference",
  ],
  meta_world_query: ["lore", "npc_public", "scene_observation"],
};

const RESTRICTED_REQUESTS: Array<{
  tokens: string[];
  requiredKind: MetaQueryFactKind;
}> = [
  { tokens: ["hp", "vida", "pontos", "ac", "armadura", "save"], requiredKind: "inspected_stat" },
  { tokens: ["dc", "dificuldade", "numerica", "exata"], requiredKind: "hidden_dc" },
  { tokens: ["futuro", "proximo", "beat", "director"], requiredKind: "future_beat" },
  { tokens: ["traidor", "traitor", "secreto", "secret"], requiredKind: "secret_identity" },
  { tokens: ["bau", "fechado", "dentro", "container"], requiredKind: "closed_container" },
];

@Injectable()
export class MetaQueryGuard {
  inspect(
    question: string,
    allowedFacts: MetaQueryAllowedFact[],
  ): MetaQueryInspection {
    const normalized = this.normalize(question);
    if (!normalized) {
      throw new DomainException(
        ErrorCode.VALIDATION_MISSING_FIELD,
        "Meta-query precisa de uma pergunta.",
      );
    }

    const intentCategory = this.classify(normalized);
    const facts = this.selectAllowedFacts(normalized, intentCategory, allowedFacts);
    this.assertRequestedRestrictedFactsArePresent(normalized, allowedFacts);
    if (facts.length === 0) this.throwScopeViolation();

    return {
      intentCategory,
      allowedFactSet: facts,
      filteredFactsCount: facts.length,
    };
  }

  private classify(question: string): MetaQueryIntentCategory {
    if (/\b(raw|regra|rules?|grapple|action|bonus action)\b/.test(question)) {
      return "rule_query";
    }
    if (/\b(percepcao|perception|passiva|nota|percebo|vejo|ouco)\b/.test(question)) {
      return "perception_query";
    }
    if (/\b(lembro|lembrar|historia|simbolo|lore|conheco)\b/.test(question)) {
      return "meta_world_query";
    }
    return "tactical_query";
  }

  private selectAllowedFacts(
    question: string,
    intentCategory: MetaQueryIntentCategory,
    allowedFacts: MetaQueryAllowedFact[],
  ): MetaQueryAllowedFact[] {
    const queryTokens = new Set(this.informativeTokens(question));
    const allowedKinds = new Set(INTENT_FACT_KINDS[intentCategory]);
    const facts = allowedFacts.filter((fact) => allowedKinds.has(fact.kind));
    if (facts.length === 0) return [];

    const matching = facts.filter((fact) =>
      this.factMatchesQuestion(fact, queryTokens),
    );
    if (matching.length > 0) return matching;

    if (intentCategory === "tactical_query" || intentCategory === "perception_query") {
      return facts.slice(0, 8);
    }
    return [];
  }

  private factMatchesQuestion(
    fact: MetaQueryAllowedFact,
    queryTokens: Set<string>,
  ): boolean {
    const factTokens = new Set([
      ...(fact.topics ?? []),
      ...this.informativeTokens(fact.text),
    ]);
    for (const token of queryTokens) {
      if (factTokens.has(token)) return true;
    }
    return false;
  }

  private assertRequestedRestrictedFactsArePresent(
    question: string,
    allowedFacts: MetaQueryAllowedFact[],
  ): void {
    const queryTokens = new Set(this.informativeTokens(question));
    for (const request of RESTRICTED_REQUESTS) {
      const requested = request.tokens.some((token) => queryTokens.has(token));
      if (!requested) continue;
      const hasAllowedFact = allowedFacts.some(
        (fact) => fact.kind === request.requiredKind,
      );
      if (!hasAllowedFact) this.throwScopeViolation();
    }
  }

  private informativeTokens(value: string): string[] {
    return this.normalize(value)
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9_:-]/g, ""))
      .filter(
        (token) =>
          (token.length >= 3 || SHORT_SIGNAL_TOKENS.has(token)) &&
          !STOP_WORDS.has(token),
      );
  }

  private throwScopeViolation(): never {
    throw new DomainException(
      ErrorCode.META_QUERY_KNOWLEDGE_SCOPE_VIOLATION,
      "Pergunta meta exige informação fora do escopo conhecido pelo personagem.",
    );
  }

  private normalize(question: string): string {
    return (question ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}
