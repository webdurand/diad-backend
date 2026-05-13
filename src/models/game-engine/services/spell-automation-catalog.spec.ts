import {
  READY_SPELL_AUTOMATION_SLUGS,
  getSpellAutomationEntry,
  isSpellAutomationReady,
} from "./spell-automation-catalog";

describe("spell automation catalog", () => {
  it("contains the finite v1 spell set", () => {
    expect(READY_SPELL_AUTOMATION_SLUGS.size).toBeGreaterThanOrEqual(50);
    expect(READY_SPELL_AUTOMATION_SLUGS.size).toBeLessThanOrEqual(70);
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
        behaviorKind: "summon",
        automationTags: expect.arrayContaining([
          "concentration",
          "summon",
          "controlled_token",
        ]),
      }),
    );
  });
});
