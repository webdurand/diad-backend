import { getSpellCondition } from "./spell-condition-catalog";

describe("spell-condition-catalog", () => {
  it("hold-person applies paralyzed via WIS save, concentration 10 rounds", () => {
    const e = getSpellCondition("hold-person");
    expect(e).toEqual({
      conditionSlug: "paralyzed",
      saveAbility: "wis",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "end_of_turn",
    });
  });

  it("web applies restrained via DEX save, concentration", () => {
    const e = getSpellCondition("web");
    expect(e).toEqual({
      conditionSlug: "restrained",
      saveAbility: "dex",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "end_of_turn",
    });
  });

  it("dominate-monster applies charmed via WIS, no repeat save", () => {
    const e = getSpellCondition("dominate-monster");
    expect(e).toEqual({
      conditionSlug: "charmed",
      saveAbility: "wis",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "never",
    });
  });

  it("maze applies incapacitated via INT, repeat save end of turn", () => {
    const e = getSpellCondition("maze");
    expect(e).toEqual({
      conditionSlug: "incapacitated",
      saveAbility: "int",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "end_of_turn",
    });
  });

  it("polymorph applies incapacitated via WIS, concentration", () => {
    const e = getSpellCondition("polymorph");
    expect(e).toEqual({
      conditionSlug: "incapacitated",
      saveAbility: "wis",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "never",
    });
  });

  it("command applies charmed via WIS, 1 round, no concentration", () => {
    const e = getSpellCondition("command");
    expect(e).toEqual({
      conditionSlug: "charmed",
      saveAbility: "wis",
      durationRounds: 1,
      requiresConcentration: false,
      repeatSaveTiming: "never",
    });
  });

  it("case insensitive", () => {
    expect(getSpellCondition("HOLD-PERSON")).not.toBeNull();
    expect(getSpellCondition("Hold-Person")).not.toBeNull();
  });

  it("unknown spell returns null", () => {
    expect(getSpellCondition("magic-missile")).toBeNull();
    expect(getSpellCondition("fireball")).toBeNull();
  });
});
