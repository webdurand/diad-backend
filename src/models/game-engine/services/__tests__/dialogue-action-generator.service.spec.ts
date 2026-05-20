import { DialogueActionGeneratorService } from "../dialogue-action-generator.service";

describe("DialogueActionGeneratorService", () => {
  const service = new DialogueActionGeneratorService();

  it("gera ações de diálogo por skills, tópicos seguros e hooks públicos", () => {
    const actions = service.generate({
      characterSkills: ["persuasion", "insight", "history"],
      characterKnownFacts: ["rumor_amulet", "secret_traitor_identity"],
      npc: {
        id: "npc-goma",
        name: "Goma",
        knowledgeScope: ["rumor_amulet", "secret_traitor_identity"],
        tags: ["public_hook:rumor_amulet", "secret_holder"],
      },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "skill_persuasion", label: "Persuadir" }),
        expect.objectContaining({ actionId: "skill_insight", label: "Ler intenção" }),
        expect.objectContaining({ actionId: "topic_rumor_amulet", label: "Perguntar sobre amuleto" }),
        expect.objectContaining({ actionId: "social_ask_more", type: "social", label: "Pedir mais informações" }),
        expect.objectContaining({ actionId: "social_question", type: "social", label: "Questionar" }),
        expect.objectContaining({ actionId: "social_convince", type: "social", label: "Convencer" }),
        expect.objectContaining({ actionId: "social_change_topic", type: "social", label: "Mudar de assunto" }),
        expect.objectContaining({ actionId: "social_greet", type: "social", label: "Cumprimentar" }),
        expect.objectContaining({ actionId: "social_farewell", type: "social", label: "Despedir-se" }),
        expect.objectContaining({ actionId: "reply_free_text", type: "reply_free_text" }),
        expect.objectContaining({ actionId: "exit_dialogue", type: "exit_dialogue" }),
        expect.objectContaining({ actionId: "meta_query", type: "meta_query" }),
      ]),
    );
    expect(actions.map((action) => action.label).join(" ")).not.toContain(
      "traitor",
    );
    expect(JSON.stringify(actions)).not.toContain("knowledgeScope");
  });

  it("omite cumprimento quando o diálogo não está no primeiro turno", () => {
    const actions = service.generate({
      characterSkills: [],
      characterKnownFacts: [],
      includeGreeting: false,
      npc: {
        id: "npc-goma",
        name: "Goma",
      },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "social_ask_more" }),
        expect.objectContaining({ actionId: "social_farewell" }),
      ]),
    );
    expect(actions.some((action) => action.actionId === "social_greet")).toBe(false);
  });
});
