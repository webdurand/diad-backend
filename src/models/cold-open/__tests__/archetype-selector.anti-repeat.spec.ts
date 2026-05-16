import { OPENING_ARCHETYPES } from "../domain/opening-archetype-catalog";
import { selectArchetype } from "../domain/archetype-selector";

describe("selectArchetype anti-repeat", () => {
  it("does not repeat the current top candidate within the three-session lookback", () => {
    const input = {
      archetypes: OPENING_ARCHETYPES,
      seed: "feedfacecafebeef",
      pcTags: ["rogue", "martial", "high-dex"],
      voiceProfile: "grim-low-fantasy",
      storyTags: [],
    };

    const first = selectArchetype({
      ...input,
      recentArchetypeKeys: [],
    }).selected.key;

    const second = selectArchetype({
      ...input,
      recentArchetypeKeys: [first],
    }).selected.key;

    const third = selectArchetype({
      ...input,
      recentArchetypeKeys: [second, first],
    }).selected.key;

    expect(new Set([first, second, third]).size).toBe(3);
  });
});
