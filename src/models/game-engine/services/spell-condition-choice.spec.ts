import {
  isBlindnessDeafnessChoice,
  resolveSpellConditionSlug,
} from "./spell-condition-choice";

describe("spell-condition-choice", () => {
  it.each(["blinded", "deafened"] as const)(
    "accepts the Blindness/Deafness choice %s",
    (choice) => {
      expect(isBlindnessDeafnessChoice(choice)).toBe(true);
      expect(
        resolveSpellConditionSlug(
          "blindness-deafness",
          "blinded",
          choice,
        ),
      ).toBe(choice);
    },
  );

  it("requires an explicit Blindness/Deafness choice", () => {
    expect(
      resolveSpellConditionSlug("blindness-deafness", "blinded"),
    ).toBeNull();
    expect(isBlindnessDeafnessChoice("restrained")).toBe(false);
  });

  it("keeps the catalog condition for other spells", () => {
    expect(resolveSpellConditionSlug("hold-person", "paralyzed")).toBe(
      "paralyzed",
    );
  });
});
