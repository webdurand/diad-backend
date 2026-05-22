import { OpenModeActionGeneratorService } from "../open-mode-action-generator.service";

describe("OpenModeActionGeneratorService", () => {
  const service = new OpenModeActionGeneratorService();

  it("gera ações alvo-first para qualquer NPC não-companion e investigação proficiente", () => {
    const actions = service.generate({
      characterSkills: ["perception", "athletics"],
      npcsPresent: [
        { id: "npc-goma", name: "Goma", dialogueWeight: "plot", presenceRole: "present" },
        { id: "npc-guard", name: "Guarda", dialogueWeight: "ambient", presenceRole: "present" },
        { id: "npc-sira", name: "Sira", dialogueWeight: "flavor", presenceRole: "present" },
        { id: "npc-companion", name: "Dmurad", dialogueWeight: "plot", presenceRole: "companion" },
      ],
    });

    expect(actions).toEqual([
      expect.objectContaining({
        actionId: "talk_npc_npc-goma",
        type: "talk_npc",
        label: "Falar com Goma",
        payload: { npcId: "npc-goma" },
      }),
      expect.objectContaining({
        actionId: "talk_npc_npc-guard",
        type: "talk_npc",
        label: "Falar com Guarda",
        payload: { npcId: "npc-guard" },
      }),
      expect.objectContaining({
        actionId: "talk_npc_npc-sira",
        type: "talk_npc",
        label: "Falar com Sira",
        payload: { npcId: "npc-sira" },
      }),
      expect.objectContaining({
        actionId: "investigate_scene",
        type: "investigate_scene",
        label: "Investigar a cena",
        payload: { skill: "perception" },
      }),
    ]);
    expect(actions.map((action) => action.label)).not.toContain("Falar com Dmurad");
  });

  it("gera exame de interactables quando disponíveis", () => {
    const actions = service.generate({
      characterSkills: [],
      npcsPresent: [],
      interactables: [{ id: "idol-1", name: "Ídolo rachado" }],
    });

    expect(actions).toEqual([
      expect.objectContaining({
        actionId: "examine_interactable_idol-1",
        type: "examine_interactable",
        label: "Examinar Ídolo rachado",
        payload: { interactableId: "idol-1", name: "Ídolo rachado" },
      }),
    ]);
  });
});
