import { NpcEntity } from "src/entities/npc.entity";
import { isDmOmniscient, projectNpc, projectNpcs } from "../npc-projection";

function makeNpc(overrides: Partial<NpcEntity> = {}): NpcEntity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    campaignId: "22222222-2222-4222-8222-222222222222",
    name: "Greta",
    slug: "greta-abc123",
    description: "ruiva atarracada, ri alto",
    descriptionHidden: "É espia dos Dragões Vermelhos",
    status: "alive",
    disposition: "friendly",
    currentLocationId: "33333333-3333-4333-8333-333333333333",
    personalityBig5: { openness: 0.7, neuroticism: 0.3 },
    motivation: "passar info pros Dragões",
    knowledgeScope: ["secret_passage", "dragon_cult"],
    dialogueStyle: "rir alto",
    voiceNotes: "alta, rasgada",
    tags: ["barwoman"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as NpcEntity;
}

describe("projectNpc — Spec 020 redaction filter (AI3 leak fix)", () => {
  it("strip default: descriptionHidden, knowledgeScope, personalityBig5, motivation, voice", () => {
    const npc = makeNpc();
    const out = projectNpc(npc);

    expect(out.descriptionHidden).toBeUndefined();
    expect(out.knowledgeScope).toBeUndefined();
    expect(out.personalityBig5).toBeUndefined();
    expect(out.motivation).toBeUndefined();
    expect(out.voiceNotes).toBeUndefined();
    expect(out.dialogueStyle).toBeUndefined();
  });

  it("preserva campos sempre visíveis (id, name, description)", () => {
    const npc = makeNpc();
    const out = projectNpc(npc);

    expect(out.id).toBe(npc.id);
    expect(out.name).toBe("Greta");
    expect(out.description).toBe("ruiva atarracada, ri alto");
  });

  it("dmOmniscient bypass: libera todos os campos", () => {
    const npc = makeNpc();
    const out = projectNpc(npc, { dmOmniscient: true });

    expect(out.descriptionHidden).toBe("É espia dos Dragões Vermelhos");
    expect(out.knowledgeScope).toEqual(["secret_passage", "dragon_cult"]);
    expect(out.personalityBig5?.openness).toBe(0.7);
    expect(out.motivation).toBe("passar info pros Dragões");
  });

  it("knowledge gating: motivation só liberado quando 'motivation_revealed' está em knownKeys", () => {
    const npc = makeNpc();
    const known = new Set(["motivation_revealed"]);
    const out = projectNpc(npc, { knownKeys: known });

    expect(out.motivation).toBe("passar info pros Dragões");

    expect(out.descriptionHidden).toBeUndefined();
    expect(out.knowledgeScope).toBeUndefined();
  });

  it("knowledge gating: personality só liberado com 'personality_revealed'", () => {
    const npc = makeNpc();
    const out = projectNpc(npc, {
      knownKeys: new Set(["personality_revealed"]),
    });

    expect(out.personalityBig5?.openness).toBe(0.7);
    expect(out.descriptionHidden).toBeUndefined();
  });

  it("knowledge gating: voice (voiceNotes/dialogueStyle) só com 'voice_known'", () => {
    const npc = makeNpc();
    const out = projectNpc(npc, { knownKeys: new Set(["voice_known"]) });

    expect(out.voiceNotes).toBe("alta, rasgada");
    expect(out.dialogueStyle).toBe("rir alto");
  });

  it("não vaza descriptionHidden mesmo com TODAS knowledge keys (só dmOmniscient libera)", () => {
    const npc = makeNpc();
    const allKeys = new Set([
      "personality_revealed",
      "voice_known",
      "motivation_revealed",
    ]);
    const out = projectNpc(npc, { knownKeys: allKeys });

    expect(out.descriptionHidden).toBeUndefined();
    expect(out.knowledgeScope).toBeUndefined();
  });

  it("projectNpcs aplica em array", () => {
    const npcs = [makeNpc(), makeNpc({ name: "Brunhild" })];
    const out = projectNpcs(npcs);

    expect(out).toHaveLength(2);
    expect(out[0].descriptionHidden).toBeUndefined();
    expect(out[1].descriptionHidden).toBeUndefined();
  });
});

describe("isDmOmniscient — header detection", () => {
  it("detecta x-diad-role lowercase", () => {
    expect(isDmOmniscient({ "x-diad-role": "dm-omniscient" })).toBe(true);
  });

  it("detecta X-DIAD-Role mixed case", () => {
    expect(isDmOmniscient({ "X-DIAD-Role": "dm-omniscient" })).toBe(true);
  });

  it("case-insensitive value", () => {
    expect(isDmOmniscient({ "x-diad-role": "DM-OMNISCIENT" })).toBe(true);
    expect(isDmOmniscient({ "x-diad-role": "DM-Omniscient" })).toBe(true);
  });

  it("rejeita valores diferentes", () => {
    expect(isDmOmniscient({ "x-diad-role": "player" })).toBe(false);
    expect(isDmOmniscient({})).toBe(false);
    expect(isDmOmniscient({ "x-diad-role": undefined })).toBe(false);
  });
});
