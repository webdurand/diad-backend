import { makeCharacterClass } from "./test-utils/entity-factories";
import { getAlwaysPreparedPaladinSpells } from "./paladin-spell-rules";

function paladin(level: number, subclassSlug = "paladin-devotion") {
  const characterClass = makeCharacterClass("paladin", level);
  characterClass.subclass = {
    slug: subclassSlug,
    name: "Oath of Devotion",
  } as never;
  return characterClass;
}

describe("getAlwaysPreparedPaladinSpells", () => {
  it("does not grant XPHB spells to PHB characters", () => {
    expect(getAlwaysPreparedPaladinSpells([paladin(20)], false)).toEqual([]);
  });

  it("grants Divine Smite from level 2 without requiring a subclass", () => {
    expect(
      getAlwaysPreparedPaladinSpells([paladin(2, "oath-of-glory")], true).map(
        (spell) => spell.slug,
      ),
    ).toEqual(["divine-smite"]);
  });

  it("grants every Devotion spell available at level 15", () => {
    expect(
      getAlwaysPreparedPaladinSpells([paladin(15)], true).map(
        (spell) => spell.slug,
      ),
    ).toEqual([
      "divine-smite",
      "find-steed",
      "protection-from-evil-and-good",
      "shield-of-faith",
      "aid",
      "zone-of-truth",
      "beacon-of-hope",
      "dispel-magic",
      "freedom-of-movement",
      "guardian-of-faith",
    ]);
  });

  it("adds the level-17 Devotion spells at the correct threshold", () => {
    expect(
      getAlwaysPreparedPaladinSpells([paladin(17)], true)
        .map((spell) => spell.slug)
        .slice(-2),
    ).toEqual(["commune", "flame-strike"]);
  });
});
