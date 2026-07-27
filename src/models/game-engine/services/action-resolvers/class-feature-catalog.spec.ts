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

  it("cataloga os recursos do Orc com economia e recargas corretas", () => {
    const adrenalineRush = CLASS_FEATURE_CATALOG.find(
      (feature) => feature.slug === "adrenaline-rush",
    )!;
    const relentlessEndurance = CLASS_FEATURE_CATALOG.find(
      (feature) => feature.slug === "relentless-endurance",
    )!;

    expect(
      matchesClass(
        adrenalineRush,
        [{ slug: "fighter", level: 10 }],
        undefined,
        "orc",
        10,
      ),
    ).toEqual({ matches: true, classLevel: 10 });
    expect(adrenalineRush.actionCost).toBe("bonus");
    expect(adrenalineRush.maxUsesByLevel?.(10)).toBe(4);
    expect(adrenalineRush.rechargeOn).toBe("short");

    expect(relentlessEndurance.actionCost).toBe("free");
    expect(relentlessEndurance.maxUsesByLevel?.(20)).toBe(1);
    expect(relentlessEndurance.rechargeOn).toBe("long");
  });

  it("não oferece recursos Ranger XPHB a uma classe Ranger PHB", () => {
    for (const slug of ["favored-enemy", "tireless", "natures-veil"]) {
      const feature = CLASS_FEATURE_CATALOG.find(
        (candidate) => candidate.slug === slug,
      )!;

      expect(
        matchesClass(feature, [{ slug: "ranger-phb", level: 20 }]).matches,
      ).toBe(false);
      expect(
        matchesClass(feature, [{ slug: "ranger", level: 20 }]).matches,
      ).toBe(true);
    }
  });
});
