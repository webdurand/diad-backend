import { concentrationMatchesExpiredArea } from "./concentration-area-expiry";

describe("concentration area expiry", () => {
  const caster = {
    id: "caster",
    isConcentrating: true,
    concentratingOn: "storm-of-vengeance-xphb",
  };

  it("ends matching concentration when its natural area duration expires", () => {
    expect(
      concentrationMatchesExpiredArea(caster, {
        casterParticipantId: "caster",
        sourceSpell: "storm-of-vengeance",
        sourceConcentration: true,
      }),
    ).toBe(true);
  });

  it("does not end another spell or a non-concentration area", () => {
    expect(
      concentrationMatchesExpiredArea(caster, {
        casterParticipantId: "caster",
        sourceSpell: "call-lightning",
        sourceConcentration: true,
      }),
    ).toBe(false);
    expect(
      concentrationMatchesExpiredArea(caster, {
        casterParticipantId: "caster",
        sourceSpell: "storm-of-vengeance",
        sourceConcentration: false,
      }),
    ).toBe(false);
  });
});
