import type { PCPersona } from "src/models/characters/dto/pc-persona.dto";
import { extractPcTags } from "../domain/pc-tag-extractor";

describe("extractPcTags", () => {
  it("maps wizard persona with mentor bond to deterministic tags", () => {
    const persona: PCPersona = {
      characterId: "pc-1",
      name: "Maguin",
      race: "High Elf",
      subrace: null,
      class: "Wizard",
      subclass: "School of Evocation",
      level: 5,
      background: "Sage",
      alignment: "true-neutral",
      personality: {
        bond: "My mentor vanished after opening a sealed observatory.",
        ideal: "Knowledge must be protected.",
        flaw: "I chase every forbidden clue.",
      },
      currentHpPercent: 100,
      conditionsActive: [],
      keyEquipmentSummary: [],
    };

    expect(extractPcTags(persona)).toEqual(
      expect.arrayContaining([
        "wizard",
        "caster",
        "bond:mentor",
        "race:high-elf",
        "background:sage",
        "scholar",
      ]),
    );
  });
});
