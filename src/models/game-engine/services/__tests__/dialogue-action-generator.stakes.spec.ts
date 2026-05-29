import { DialogueActionGeneratorService } from "../dialogue-action-generator.service";

describe("DialogueActionGeneratorService stakes", () => {
  const service = new DialogueActionGeneratorService();

  it("anota stakes em skill actions por skill e peso narrativo do NPC", () => {
    const actions = service.generate({
      characterSkills: ["insight", "persuasion", "intimidation"],
      characterKnownFacts: [],
      npc: {
        id: "npc-1",
        name: "Goma",
        dialogueWeight: "plot",
      },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "skill_insight",
          payload: expect.objectContaining({ stakes: "narrative" }),
        }),
        expect.objectContaining({
          actionId: "skill_persuasion",
          payload: expect.objectContaining({ stakes: "high" }),
        }),
        expect.objectContaining({
          actionId: "skill_intimidation",
          payload: expect.objectContaining({ stakes: "high" }),
        }),
      ]),
    );
  });

  it("limita a 3 skills priorizando os stakes mais altos", () => {
    const actions = service.generate({
      characterSkills: [
        "history",
        "investigation",
        "persuasion",
        "intimidation",
        "insight",
      ],
      characterKnownFacts: [],
      npc: { id: "npc-1", name: "Goma", dialogueWeight: "plot" },
    });

    const skillIds = actions
      .filter((action) => action.type === "skill")
      .map((action) => action.actionId);
    // plot NPC: persuasion/intimidation = high; demais = narrative.
    // Top 3 por stakes; empate por ordem canônica de SKILL_LABELS.
    expect(skillIds).toEqual([
      "skill_persuasion",
      "skill_intimidation",
      "skill_insight",
    ]);
  });

  it("gera press via talk_npc quando ha knowledgeScope nao revelado", () => {
    const actions = service.generate({
      characterSkills: [],
      characterKnownFacts: ["rumor_amulet"],
      npc: {
        id: "npc-1",
        name: "Goma",
        knowledgeScope: ["rumor_amulet", "secret_traitor_identity"],
        tags: ["secret_holder"],
        dialogueWeight: "plot",
      },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "talk_press_more",
          type: "talk_npc",
          payload: expect.objectContaining({
            action: "press",
            topic: "unrevealed",
            stakes: "narrative",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(actions)).not.toContain("traitor");
  });
});
