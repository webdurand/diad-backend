import { OPENING_ARCHETYPES } from "../domain/opening-archetype-catalog";
import { selectArchetype } from "../domain/archetype-selector";

describe("selectArchetype", () => {
  it("returns the same archetype for the same seed, tags and history", () => {
    const first = selectArchetype({
      archetypes: OPENING_ARCHETYPES,
      seed: "0123456789abcdef",
      pcTags: ["wizard", "caster", "bond:mentor", "background:sage"],
      voiceProfile: "investigativo-misterioso",
      recentArchetypeKeys: [],
      storyTags: ["mystery"],
    }).selected.key;

    for (let i = 0; i < 100; i += 1) {
      expect(
        selectArchetype({
          archetypes: OPENING_ARCHETYPES,
          seed: "0123456789abcdef",
          pcTags: ["wizard", "caster", "bond:mentor", "background:sage"],
          voiceProfile: "investigativo-misterioso",
          recentArchetypeKeys: [],
          storyTags: ["mystery"],
        }).selected.key,
      ).toBe(first);
    }
  });

  it("covers at least six archetypes across fifty different seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      seen.add(
        selectArchetype({
          archetypes: OPENING_ARCHETYPES,
          seed: i.toString(16).padStart(16, "0"),
          pcTags: ["fighter", "martial", "high-dex", "bond:mentor"],
          voiceProfile: "heroic-high-fantasy",
          recentArchetypeKeys: [],
          storyTags: [],
        }).selected.key,
      );
    }

    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
