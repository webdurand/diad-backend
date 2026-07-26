import {
  READY_SPELL_AUTOMATION_SLUGS,
  getSpellAutomationEntry,
  isSpellAutomationReady,
} from "./spell-automation-catalog";

describe("spell automation catalog", () => {
  it("contains the finite v1 spell set", () => {
    expect(READY_SPELL_AUTOMATION_SLUGS.size).toBeGreaterThanOrEqual(50);
    expect(READY_SPELL_AUTOMATION_SLUGS.size).toBeLessThanOrEqual(100);
  });

  it("normalizes edition suffixes when checking readiness", () => {
    expect(isSpellAutomationReady("fireball-phb")).toBe(true);
    expect(isSpellAutomationReady("fireball-xphb")).toBe(true);
    expect(isSpellAutomationReady("unmodeled-spell")).toBe(false);
  });

  it("exposes behavior metadata for ready spells", () => {
    expect(getSpellAutomationEntry("wall-of-fire")).toEqual(
      expect.objectContaining({
        status: "ready",
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "concentration",
          "damage",
          "wall",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("fog-cloud")).toEqual(
      expect.objectContaining({
        status: "ready",
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "concentration",
          "obscurement",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("conjure-elemental")).toEqual(
      expect.objectContaining({
        status: "ready",
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "concentration",
          "area",
          "control",
          "restrained",
          "element_choice",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("spiritual-weapon")).toEqual(
      expect.objectContaining({
        status: "ready",
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "movable",
          "spell_attack",
          "bonus_action",
          "no_concentration",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("guardian-of-faith")).toEqual(
      expect.objectContaining({
        status: "ready",
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "damage",
          "dexterity_save",
          "stationary",
          "large",
          "no_concentration",
          "damage_budget",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("heal")).toEqual(
      expect.objectContaining({
        behaviorKind: "healing",
        automationTags: expect.arrayContaining([
          "healing",
          "condition_removal",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("shield-of-faith-xphb")).toEqual(
      expect.objectContaining({
        behaviorKind: "buff",
        automationTags: expect.arrayContaining([
          "concentration",
          "defense",
          "bonus_action",
        ]),
      }),
    );
    expect(
      getSpellAutomationEntry("protection-from-evil-and-good-xphb"),
    ).toEqual(
      expect.objectContaining({
        behaviorKind: "buff",
        automationTags: expect.arrayContaining([
          "concentration",
          "condition_immunity",
          "creature_type",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("aid-xphb")).toEqual(
      expect.objectContaining({
        behaviorKind: "buff",
        automationTags: expect.arrayContaining([
          "buff",
          "multi_target",
          "hit_points",
        ]),
      }),
    );
    expect(getSpellAutomationEntry("fire-storm")).toEqual(
      expect.objectContaining({
        behaviorKind: "save_damage",
        automationTags: expect.arrayContaining(["aoe", "multi_cube"]),
      }),
    );
    expect(getSpellAutomationEntry("sunburst")).toEqual(
      expect.objectContaining({
        behaviorKind: "save_damage",
        automationTags: expect.arrayContaining(["aoe", "blinded"]),
      }),
    );
    expect(getSpellAutomationEntry("storm-of-vengeance")).toEqual(
      expect.objectContaining({
        behaviorKind: "persistent_area",
        automationTags: expect.arrayContaining([
          "concentration",
          "multi_round",
        ]),
      }),
    );
  });
});
