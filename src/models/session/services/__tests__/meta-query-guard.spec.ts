import { MetaQueryGuard } from "../meta-query-guard.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type { MetaQueryAllowedFact } from "../meta-query-fact-resolver.service";

describe("MetaQueryGuard", () => {
  const guard = new MetaQueryGuard();
  const allowedFacts: MetaQueryAllowedFact[] = [
    {
      factId: "scene:wall",
      kind: "scene_observation",
      text: "Cena atual: um muro alto fecha a saída do beco.",
      source: "scene_context",
      topics: ["muro", "alto", "beco"],
    },
    {
      factId: "skill:acrobatics",
      kind: "pc_capability",
      text: "Skill do PC: Acrobatics (proficiente).",
      source: "character_sheet",
      topics: ["acrobatics", "skill", "teste"],
    },
    {
      factId: "rule:grapple",
      kind: "rule_reference",
      text: "Grapple é resolvido por regra RAW quando a ação é declarada.",
      source: "srd_skill_reference",
      topics: ["grapple", "raw", "regra"],
    },
    {
      factId: "lore:symbol",
      kind: "lore",
      text: "Símbolo do corvo: a guilda usa esse sinal em rotas antigas.",
      source: "party_knowledge",
      topics: ["simbolo", "corvo", "guilda"],
    },
  ];

  it.each([
    "Qual é o HP do assassino?",
    "Me mostra a AC do guarda?",
    "Qual é a DC numérica para abrir essa porta?",
    "Qual é o próximo beat do Director?",
    "Quem é o traidor secreto?",
    "O que tem dentro do baú fechado?",
    "Qual save secreto ele tem?",
    "Qual evento futuro vai acontecer?",
  ])("rejeita info onisciente: %s", (question) => {
    expect(() => guard.inspect(question, allowedFacts)).toThrow(
      expect.objectContaining({
        code: ErrorCode.META_QUERY_KNOWLEDGE_SCOPE_VIOLATION,
      }),
    );
  });

  it.each([
    ["posso pular o muro com Acrobatics?", "tactical_query"],
    ["o que minha percepção passiva nota aqui?", "perception_query"],
    ["como funciona grapple no RAW?", "rule_query"],
    ["me lembro de algo sobre esse símbolo?", "meta_world_query"],
  ] as const)("categoriza %s como %s", (question, expected) => {
    const result = guard.inspect(question, allowedFacts);
    expect(result.intentCategory).toBe(expected);
    expect(result.filteredFactsCount).toBeGreaterThan(0);
  });
});
