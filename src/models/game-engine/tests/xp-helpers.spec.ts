
import {
  XP_THRESHOLDS_2024,
  applyXpAward,
  computeXpProgress,
  levelForXp,
  policyAdjustedAward,
  xpThresholdForLevel,
} from "../services/xp-helpers";

describe("xp-helpers — levelForXp", () => {
  it("0 XP → level 1", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("299 XP → still level 1", () => {
    expect(levelForXp(299)).toBe(1);
  });

  it("300 XP → exact level 2", () => {
    expect(levelForXp(300)).toBe(2);
  });

  it("14000 XP → level 6", () => {
    expect(levelForXp(14000)).toBe(6);
  });

  it("355000 XP → level 20", () => {
    expect(levelForXp(355000)).toBe(20);
  });

  it("1000000 XP → still level 20 (cap)", () => {
    expect(levelForXp(1000000)).toBe(20);
  });

  it("negative XP → level 1", () => {
    expect(levelForXp(-50)).toBe(1);
  });
});

describe("xp-helpers — xpThresholdForLevel", () => {
  it("level 1 = 0", () => {
    expect(xpThresholdForLevel(1)).toBe(0);
  });

  it("level 2 = 300", () => {
    expect(xpThresholdForLevel(2)).toBe(300);
  });

  it("level 20 = 355000", () => {
    expect(xpThresholdForLevel(20)).toBe(355000);
  });

  it("level 21 caps at 355000", () => {
    expect(xpThresholdForLevel(21)).toBe(355000);
  });
});

describe("xp-helpers — computeXpProgress", () => {
  it("0 XP: level 1, 0 in level, 300 needed for next", () => {
    const p = computeXpProgress(0);
    expect(p.level).toBe(1);
    expect(p.xpInLevel).toBe(0);
    expect(p.xpRequiredForNextLevel).toBe(300);
    expect(p.progressFraction).toBe(0);
    expect(p.xpToNextLevel).toBe(300);
    expect(p.isMaxLevel).toBe(false);
  });

  it("150 XP (mid level 1): half of 300", () => {
    const p = computeXpProgress(150);
    expect(p.progressFraction).toBeCloseTo(0.5);
    expect(p.xpToNextLevel).toBe(150);
  });

  it("600 XP (level 2 mid): 300 in level, 600 needed", () => {
    const p = computeXpProgress(600);
    expect(p.level).toBe(2);
    expect(p.xpInLevel).toBe(300);
    expect(p.xpRequiredForNextLevel).toBe(600);
    expect(p.progressFraction).toBeCloseTo(0.5);
  });

  it("355000 XP: max level", () => {
    const p = computeXpProgress(355000);
    expect(p.level).toBe(20);
    expect(p.isMaxLevel).toBe(true);
    expect(p.xpToNextLevel).toBe(0);
    expect(p.progressFraction).toBe(1);
  });
});

describe("xp-helpers — policyAdjustedAward", () => {
  it("rules mode passes amount through", () => {
    expect(policyAdjustedAward(200, "combat_kill", "rules")).toBe(200);
    expect(policyAdjustedAward(200, "roleplay", "rules")).toBe(200);
  });

  it("milestone mode coerces non-milestone to 0", () => {
    expect(policyAdjustedAward(200, "combat_kill", "milestone")).toBe(0);
    expect(policyAdjustedAward(200, "roleplay", "milestone")).toBe(0);
  });

  it("milestone mode allows quest_step", () => {
    expect(policyAdjustedAward(500, "quest_step", "milestone")).toBe(500);
  });

  it("milestone mode allows quest_completion + exploration_milestone", () => {
    expect(policyAdjustedAward(500, "quest_completion", "milestone")).toBe(500);
    expect(policyAdjustedAward(500, "exploration_milestone", "milestone")).toBe(
      500,
    );
  });

  it("hybrid mode allows combat + milestone, coerces roleplay", () => {
    expect(policyAdjustedAward(200, "combat_kill", "hybrid")).toBe(200);
    expect(
      policyAdjustedAward(200, "combat_resolved_peacefully", "hybrid"),
    ).toBe(200);
    expect(policyAdjustedAward(200, "quest_step", "hybrid")).toBe(200);
    expect(policyAdjustedAward(200, "roleplay", "hybrid")).toBe(0);
    expect(policyAdjustedAward(200, "skill_challenge", "hybrid")).toBe(0);
  });
});

describe("xp-helpers — applyXpAward", () => {
  it("award 200 XP to L1 PC at 100 XP", () => {
    const r = applyXpAward({
      totalXpBefore: 100,
      amount: 200,
      source: "combat_kill",
    });
    expect(r.awardedXp).toBe(200);
    expect(r.totalXpAfter).toBe(300);
    expect(r.levelBefore).toBe(1);
    expect(r.levelAfter).toBe(2);
    expect(r.levelUpReady).toBe(true);
    expect(r.nextThreshold).toBe(900);
  });

  it("award 200 XP to L1 PC at 0 XP — no level-up yet", () => {
    const r = applyXpAward({
      totalXpBefore: 0,
      amount: 200,
      source: "combat_kill",
    });
    expect(r.totalXpAfter).toBe(200);
    expect(r.levelAfter).toBe(1);
    expect(r.levelUpReady).toBe(false);
    expect(r.xpToNextLevel).toBe(100);
  });

  it("milestone mode roleplay award coerced to 0", () => {
    const r = applyXpAward({
      totalXpBefore: 1000,
      amount: 500,
      source: "roleplay",
      mode: "milestone",
    });
    expect(r.awardedXp).toBe(0);
    expect(r.totalXpAfter).toBe(1000);
    expect(r.modeApplied).toBe("milestone");
  });

  it("award at max level keeps level 20 + isMax flag", () => {
    const r = applyXpAward({
      totalXpBefore: 400000,
      amount: 50000,
      source: "combat_kill",
    });
    expect(r.levelAfter).toBe(20);
    expect(r.nextThreshold).toBe(0);
    expect(r.xpToNextLevel).toBe(0);
  });

  it("award negative amount clamps total to 0", () => {
    const r = applyXpAward({
      totalXpBefore: 100,
      amount: -300,
      source: "roleplay",
    });
    expect(r.totalXpAfter).toBe(0);
  });
});

describe("xp-helpers — table integrity", () => {
  it("XP_THRESHOLDS_2024 has 20 entries", () => {
    expect(XP_THRESHOLDS_2024.length).toBe(20);
  });

  it("thresholds are monotonically increasing", () => {
    for (let i = 1; i < XP_THRESHOLDS_2024.length; i++) {
      expect(XP_THRESHOLDS_2024[i]).toBeGreaterThan(XP_THRESHOLDS_2024[i - 1]);
    }
  });
});
