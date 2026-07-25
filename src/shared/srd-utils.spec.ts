import {
  inferWeaponCategory,
  isEquipmentProficient,
} from "./srd-utils";

describe("SRD equipment proficiency", () => {
  it("infers source-suffixed martial weapons when the join table is absent", () => {
    expect(inferWeaponCategory("greatsword-phb")).toBe(
      "martial-melee-weapons",
    );
    expect(
      isEquipmentProficient(
        "greatsword-phb",
        new Set(),
        new Set(["martial-weapons"]),
      ),
    ).toBe(true);
  });

  it("keeps a known martial weapon non-proficient without martial proficiency", () => {
    expect(
      isEquipmentProficient("greatsword-phb", new Set(), new Set()),
    ).toBe(false);
  });

  it("does not classify non-weapons as weapons", () => {
    expect(
      isEquipmentProficient("explorers-pack", new Set(), new Set()),
    ).toBeNull();
  });
});
