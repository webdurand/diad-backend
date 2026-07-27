import {
  hasEvasionFeature,
  resolveEvasionDamage,
} from "./evasion";

describe("Evasion", () => {
  it.each([
    ["rogue", 7],
    ["rogue-xphb", 10],
    ["monk-phb", 7],
  ])("is available to %s level %s", (slug, level) => {
    expect(hasEvasionFeature([{ slug, level } as never], [])).toBe(true);
  });

  it("does not apply below level 7 or while incapacitated", () => {
    expect(
      hasEvasionFeature([{ slug: "rogue", level: 6 } as never], []),
    ).toBe(false);
    expect(
      hasEvasionFeature(
        [{ slug: "rogue", level: 10 } as never],
        ["stunned"],
      ),
    ).toBe(false);
  });

  it("recognizes only a materialized PHB Hunter Evasion on Ranger 15+", () => {
    const ranger = [{ slug: "ranger-phb", level: 15 } as never];

    expect(
      hasEvasionFeature(ranger, [], [
        {
          slug: "evasion-ranger-hunter-15-phb",
          active: true,
        },
      ]),
    ).toBe(true);
    expect(
      hasEvasionFeature(
        [{ slug: "ranger-phb", level: 14 } as never],
        [],
        [{ slug: "evasion-ranger-hunter-15-phb", active: true }],
      ),
    ).toBe(false);
    expect(
      hasEvasionFeature(ranger, [], [
        {
          slug: "evasion-ranger-hunter-15-phb",
          active: false,
        },
      ]),
    ).toBe(false);
  });

  it("does not infer Hunter Evasion from the parent choice or an alternative", () => {
    const ranger = [{ slug: "ranger-phb", level: 20 } as never];

    expect(
      hasEvasionFeature(ranger, [], [
        {
          slug: "superior-hunters-defense-ranger-hunter-15-phb",
          active: true,
        },
      ]),
    ).toBe(false);
    expect(
      hasEvasionFeature(ranger, [], [
        {
          slug: "uncanny-dodge-ranger-hunter-15-phb",
          active: true,
        },
      ]),
    ).toBe(false);
  });

  it("reduces a successful Dexterity half-damage save to zero", () => {
    expect(
      resolveEvasionDamage({
        damageAfterSave: 17,
        saveAbility: "dex",
        saveSucceeded: true,
        halfDamageOnSuccess: true,
        hasEvasion: true,
      }),
    ).toEqual({ applied: true, damageAfterEvasion: 0 });
  });

  it("halves a failed Dexterity half-damage save", () => {
    expect(
      resolveEvasionDamage({
        damageAfterSave: 35,
        saveAbility: "dexterity",
        saveSucceeded: false,
        halfDamageOnSuccess: true,
        hasEvasion: true,
      }),
    ).toEqual({ applied: true, damageAfterEvasion: 17 });
  });

  it("does not alter non-Dexterity saves or effects that negate on success", () => {
    expect(
      resolveEvasionDamage({
        damageAfterSave: 20,
        saveAbility: "con",
        saveSucceeded: false,
        halfDamageOnSuccess: true,
        hasEvasion: true,
      }),
    ).toEqual({ applied: false, damageAfterEvasion: 20 });
    expect(
      resolveEvasionDamage({
        damageAfterSave: 20,
        saveAbility: "dex",
        saveSucceeded: true,
        halfDamageOnSuccess: false,
        hasEvasion: true,
      }),
    ).toEqual({ applied: false, damageAfterEvasion: 20 });
  });
});
