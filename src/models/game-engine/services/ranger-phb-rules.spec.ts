import { hasPhbFeralSenses } from "./ranger-phb-rules";

describe("Ranger PHB rules", () => {
  const ranger = (level: number) => ({
    classes: [{ slug: "ranger-phb", level }],
    features: [
      {
        slug: "feral-senses-ranger-18-phb",
        active: true,
        sourceCode: "PHB",
      },
    ],
  });

  it("recognizes the exact active PHB feature on a Ranger 18+", () => {
    expect(hasPhbFeralSenses(ranger(18))).toBe(true);
    expect(hasPhbFeralSenses(ranger(20))).toBe(true);
  });

  it("does not infer Feral Senses below level 18 or from an inactive feature", () => {
    expect(hasPhbFeralSenses(ranger(17))).toBe(false);
    expect(
      hasPhbFeralSenses({
        ...ranger(20),
        features: [
          {
            slug: "feral-senses-ranger-18-phb",
            active: false,
            sourceCode: "PHB",
          },
        ],
      }),
    ).toBe(false);
  });

  it("does not accept source or slug leakage", () => {
    expect(
      hasPhbFeralSenses({
        classes: [{ slug: "rogue-phb", level: 20 }],
        features: ranger(20).features,
      }),
    ).toBe(false);
    expect(
      hasPhbFeralSenses({
        classes: [{ slug: "ranger-xphb", level: 20 }],
        features: ranger(20).features,
      }),
    ).toBe(false);
  });
});
