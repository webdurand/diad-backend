import { isWebRestraint } from "./web-restraint";

describe("isWebRestraint", () => {
  it("recognizes the Web spell", () => {
    expect(
      isWebRestraint({
        slug: "restrained",
        source: "spell:web",
        sourceSpell: "web-xphb",
      }),
    ).toBe(true);
  });

  it("recognizes a monster Web ability", () => {
    expect(
      isWebRestraint({
        slug: "restrained",
        source: "ability:giant-spider-web-recharge-5",
        sourceSpell: null,
      }),
    ).toBe(true);
  });

  it("does not treat unrelated restraint as Web", () => {
    expect(
      isWebRestraint({
        slug: "restrained",
        source: "ability:grasping-roots",
        sourceSpell: null,
      }),
    ).toBe(false);
  });
});
