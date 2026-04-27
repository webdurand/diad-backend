/**
 * damage-trigger-helpers — Spec 016 P4 (M3) tests.
 *
 * Massive damage 2024 detection (PHB rule), Fate Ladder trigger
 * dispatch, hardcore vs narrative mode gating.
 */
import {
  detectFateLadderTrigger,
  isMassiveDamage2024,
  shouldOpenFateLadder,
} from "../services/damage-trigger-helpers";

describe("isMassiveDamage2024", () => {
  it("true when remaining damage zeroes HP + excess >= hpMax", () => {
    // PC com 5 HP, hpMax 10, recebe 18 dano → 5 zerados + 13 excess >= 10 → massive
    expect(
      isMassiveDamage2024({
        hpBefore: 5,
        hpMax: 10,
        damageRemaining: 18,
        wasDying: false,
      }),
    ).toBe(true);
  });

  it("false when excess < hpMax (regular drop to 0)", () => {
    // PC com 5 HP, hpMax 50, recebe 10 dano → 5 excess << 50 → dying not dead
    expect(
      isMassiveDamage2024({
        hpBefore: 5,
        hpMax: 50,
        damageRemaining: 10,
        wasDying: false,
      }),
    ).toBe(false);
  });

  it("false when excess exactly < hpMax", () => {
    // hpBefore 10, hpMax 30, dmg 35 → excess 25 < 30
    expect(
      isMassiveDamage2024({
        hpBefore: 10,
        hpMax: 30,
        damageRemaining: 35,
        wasDying: false,
      }),
    ).toBe(false);
  });

  it("true when excess EQUALS hpMax (>=)", () => {
    // hpBefore 10, hpMax 30, dmg 40 → excess 30 == 30 → massive (RAW: >=)
    expect(
      isMassiveDamage2024({
        hpBefore: 10,
        hpMax: 30,
        damageRemaining: 40,
        wasDying: false,
      }),
    ).toBe(true);
  });

  it("false when wasDying (different rule applies — death saves)", () => {
    expect(
      isMassiveDamage2024({
        hpBefore: 0,
        hpMax: 50,
        damageRemaining: 100,
        wasDying: true,
      }),
    ).toBe(false);
  });

  it("false when damage does not zero HP", () => {
    expect(
      isMassiveDamage2024({
        hpBefore: 50,
        hpMax: 50,
        damageRemaining: 30,
        wasDying: false,
      }),
    ).toBe(false);
  });

  it("handles hpMax 0 gracefully", () => {
    expect(
      isMassiveDamage2024({
        hpBefore: 0,
        hpMax: 0,
        damageRemaining: 100,
        wasDying: false,
      }),
    ).toBe(false);
  });
});

describe("detectFateLadderTrigger", () => {
  it("returns instant_kill_effect when flag set", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 50,
      hpMax: 50,
      damageRemaining: 0,
      wasDying: false,
      isInstantKillEffect: true,
    });
    expect(t).toBe("instant_kill_effect");
  });

  it("returns massive_damage_2024 when massive", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 5,
      hpMax: 10,
      damageRemaining: 18,
      wasDying: false,
    });
    expect(t).toBe("massive_damage_2024");
  });

  it("returns three_failed_death_saves when dying + 3 fails", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 0,
      hpMax: 30,
      damageRemaining: 5,
      wasDying: true,
      failuresAfter: 3,
    });
    expect(t).toBe("three_failed_death_saves");
  });

  it("returns null when dying with <3 failures", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 0,
      hpMax: 30,
      damageRemaining: 5,
      wasDying: true,
      failuresAfter: 1,
    });
    expect(t).toBeNull();
  });

  it("returns null when regular damage (not massive, not dying)", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 30,
      hpMax: 30,
      damageRemaining: 15,
      wasDying: false,
    });
    expect(t).toBeNull();
  });

  it("instant_kill_effect overrides massive_damage", () => {
    const t = detectFateLadderTrigger({
      hpBefore: 5,
      hpMax: 10,
      damageRemaining: 100,
      wasDying: false,
      isInstantKillEffect: true,
    });
    expect(t).toBe("instant_kill_effect");
  });
});

describe("shouldOpenFateLadder", () => {
  it("hardcore mode never opens Fate Ladder", () => {
    expect(shouldOpenFateLadder("massive_damage_2024", "hardcore")).toBe(false);
    expect(shouldOpenFateLadder("three_failed_death_saves", "hardcore")).toBe(
      false,
    );
    expect(shouldOpenFateLadder("instant_kill_effect", "hardcore")).toBe(false);
  });

  it("narrative mode opens for any non-null trigger", () => {
    expect(shouldOpenFateLadder("massive_damage_2024", "narrative")).toBe(true);
    expect(shouldOpenFateLadder("three_failed_death_saves", "narrative")).toBe(
      true,
    );
    expect(shouldOpenFateLadder("instant_kill_effect", "narrative")).toBe(true);
  });

  it("null trigger never opens, regardless of mode", () => {
    expect(shouldOpenFateLadder(null, "narrative")).toBe(false);
    expect(shouldOpenFateLadder(null, "hardcore")).toBe(false);
  });
});
