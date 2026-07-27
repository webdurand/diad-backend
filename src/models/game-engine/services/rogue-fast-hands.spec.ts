import { hasFastHandsFeature } from "./rogue-fast-hands";

describe("Fast Hands eligibility", () => {
  it.each(["thief", "rogue-thief", "rogue-thief-xphb"])(
    "accepts the Thief subclass slug %s at Rogue level 3+",
    (subclass) => {
      expect(
        hasFastHandsFeature([
          {
            slug: "rogue",
            level: 3,
            subclass: { slug: subclass, name: "Thief" },
          },
        ]),
      ).toBe(true);
    },
  );

  it("rejects another subclass and Rogue below level 3", () => {
    expect(
      hasFastHandsFeature([
        {
          slug: "rogue",
          level: 10,
          subclass: { slug: "assassin", name: "Assassin" },
        },
      ]),
    ).toBe(false);
    expect(
      hasFastHandsFeature([
        {
          slug: "rogue",
          level: 2,
          subclass: { slug: "thief", name: "Thief" },
        },
      ]),
    ).toBe(false);
  });
});
