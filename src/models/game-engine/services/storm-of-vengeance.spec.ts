import { getStormOfVengeancePhase } from "./storm-of-vengeance";
import { concentrationSupportsSpell } from "./spell-casting.service";

describe("Storm of Vengeance phases", () => {
  it("leaves round 1 to the initial spell resolution", () => {
    expect(getStormOfVengeancePhase(4, 4)).toBeNull();
  });

  it.each([
    [5, "1d6", "acid", undefined, undefined],
    [6, "10d6", "lightning", "dex", 6],
    [7, "2d6", "bludgeoning", undefined, undefined],
    [8, "1d6", "cold", undefined, undefined],
    [13, "1d6", "cold", undefined, undefined],
  ])(
    "maps encounter round %i to the expected phase",
    (currentRound, expression, type, saveAbility, maxTargets) => {
      const optional = {
        ...(saveAbility ? { saveAbility } : {}),
        ...(maxTargets ? { maxTargets } : {}),
      };
      expect(getStormOfVengeancePhase(4, currentRound)).toEqual(
        expect.objectContaining({
          damageExpression: expression,
          damageType: type,
          ...optional,
        }),
      );
    },
  );

  it("ends after the tenth storm round", () => {
    expect(getStormOfVengeancePhase(4, 14)).toBeNull();
  });
});

describe("Storm of Vengeance concentration persistence", () => {
  it("keeps the area only while the caster is concentrating on this spell", () => {
    expect(
      concentrationSupportsSpell(
        {
          isConcentrating: true,
          concentratingOn: "storm-of-vengeance-xphb",
        },
        "storm-of-vengeance",
      ),
    ).toBe(true);
    expect(
      concentrationSupportsSpell(
        { isConcentrating: false, concentratingOn: null },
        "storm-of-vengeance",
      ),
    ).toBe(false);
    expect(
      concentrationSupportsSpell(
        { isConcentrating: true, concentratingOn: "call-lightning" },
        "storm-of-vengeance",
      ),
    ).toBe(false);
  });
});
