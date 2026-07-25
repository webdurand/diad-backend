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
      durationRounds: 600,
      requiresConcentration: true,
      repeatSaveTiming: "never",
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

  it("suggestion lasts up to 8 hours without repeat saves", () => {
    expect(getSpellCondition("suggestion")).toEqual(
      expect.objectContaining({
        conditionSlug: "charmed",
        durationRounds: 4_800,
        requiresConcentration: true,
        repeatSaveTiming: "never",
      }),
    );
  });

  it("hypnotic-pattern applies the composite hypnotized state", () => {
    expect(getSpellCondition("hypnotic-pattern")).toEqual({
      conditionSlug: "hypnotized",
      saveAbility: "wis",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "never",
    });
  });

  it("banishment applies the composite off-plane banished state", () => {
    expect(getSpellCondition("banishment")).toEqual({
      conditionSlug: "banished",
      saveAbility: "cha",
      durationRounds: 10,
      requiresConcentration: true,
      repeatSaveTiming: "never",
    });
  });

  it("sunburst aplica cegueira por 1 minuto com novo save no fim do turno", () => {
    expect(getSpellCondition("sunburst")).toEqual({
      conditionSlug: "blinded",
      saveAbility: "con",
      durationRounds: 10,
      requiresConcentration: false,
      repeatSaveTiming: "end_of_turn",
    });
  });

  it("storm of vengeance aplica surdez por 5 minutos sem save repetido", () => {
    expect(getSpellCondition("storm-of-vengeance")).toEqual({
      conditionSlug: "deafened",
      saveAbility: "con",
      durationRounds: 50,
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
