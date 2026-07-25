import {
  CLASS_FEATURE_CATALOG,
  matchesClass,
} from "./class-feature-catalog";

describe("class feature catalog — species sources", () => {
  const largeForm = CLASS_FEATURE_CATALOG.find(
    (feature) => feature.slug === "large-form",
  )!;

  it("usa o nível total para um Golias de qualquer classe", () => {
    expect(
      matchesClass(
        largeForm,
        [{ slug: "wizard", level: 20 }],
        undefined,
        "goliath",
        20,
      ),
    ).toEqual({ matches: true, classLevel: 20 });
  });

  it("não concede o traço a outra espécie", () => {
    expect(
      matchesClass(
        largeForm,
        [{ slug: "druid", level: 20 }],
        undefined,
        "elf",
        20,
      ).matches,
    ).toBe(false);
  });
});
