import { shouldDisintegrateTarget } from "./disintegrate-rules";

describe("disintegrate-rules", () => {
  it("disintegrates a target reduced from positive HP to zero", () => {
    expect(
      shouldDisintegrateTarget({
        spellSlug: "disintegrate",
        hpBefore: 68,
        hpAfter: 0,
        damageApplied: 73,
      }),
    ).toBe(true);
  });

  it("accepts source-qualified spell slugs", () => {
    expect(
      shouldDisintegrateTarget({
        spellSlug: "disintegrate-xphb",
        hpBefore: 10,
        hpAfter: 0,
        damageApplied: 20,
      }),
    ).toBe(true);
  });

  it.each([
    {
      label: "another spell",
      spellSlug: "fireball",
      hpBefore: 10,
      hpAfter: 0,
      damageApplied: 20,
    },
    {
      label: "a target that was already at zero",
      spellSlug: "disintegrate",
      hpBefore: 0,
      hpAfter: 0,
      damageApplied: 20,
    },
    {
      label: "a successful save that dealt no damage",
      spellSlug: "disintegrate",
      hpBefore: 10,
      hpAfter: 10,
      damageApplied: 0,
    },
  ])("does not disintegrate $label", ({ label: _label, ...resolution }) => {
    expect(shouldDisintegrateTarget(resolution)).toBe(false);
  });
});
