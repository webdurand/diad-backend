import { ExhaustionService } from "../services/exhaustion.service";

describe("ExhaustionService (Spec 004 CP9)", () => {
  const svc = new ExhaustionService();

  describe("2014 — 6 níveis cumulativos (RAW PHB Apêndice A)", () => {
    it("level 0: sem modificadores", () => {
      const m = svc.getModifiers(0, "2014_six_levels");
      expect(m.disadvAbility).toBe(false);
      expect(m.speedMultiplier).toBe(1);
      expect(m.dead).toBe(false);
    });
    it("level 1: disadvantage em ability checks", () => {
      const m = svc.getModifiers(1, "2014_six_levels");
      expect(m.disadvAbility).toBe(true);
      expect(m.speedMultiplier).toBe(1);
      expect(m.disadvAttack).toBe(false);
    });
    it("level 2: speed metade", () => {
      const m = svc.getModifiers(2, "2014_six_levels");
      expect(m.speedMultiplier).toBe(0.5);
    });
    it("level 3: disadvantage em ataques e saves", () => {
      const m = svc.getModifiers(3, "2014_six_levels");
      expect(m.disadvAttack).toBe(true);
      expect(m.disadvSave).toBe(true);
    });
    it("level 4: maxHP metade", () => {
      const m = svc.getModifiers(4, "2014_six_levels");
      expect(m.maxHpMultiplier).toBe(0.5);
    });
    it("level 5: speed 0", () => {
      const m = svc.getModifiers(5, "2014_six_levels");
      expect(m.speedMultiplier).toBe(0);
    });
    it("level 6: morte", () => {
      const m = svc.getModifiers(6, "2014_six_levels");
      expect(m.dead).toBe(true);
    });
  });

  describe("2024 — 6 níveis flat (RAW Rules Glossary)", () => {
    it("level 0: sem penalidades", () => {
      const m = svc.getModifiers(0, "2024_six_levels");
      expect(m.d20Penalty).toBe(0);
      expect(m.speedPenaltyFt).toBe(0);
      expect(m.dead).toBe(false);
    });
    it("level 1: -2 d20s, -5 ft speed", () => {
      const m = svc.getModifiers(1, "2024_six_levels");
      expect(m.d20Penalty).toBe(-2);
      expect(m.speedPenaltyFt).toBe(-5);

      expect(m.disadvAttack).toBe(false);
      expect(m.disadvAbility).toBe(false);
      expect(m.disadvSave).toBe(false);
    });
    it("level 5: -10 d20s, -25 ft speed", () => {
      const m = svc.getModifiers(5, "2024_six_levels");
      expect(m.d20Penalty).toBe(-10);
      expect(m.speedPenaltyFt).toBe(-25);
      expect(m.dead).toBe(false);
    });
    it("level 6: morte", () => {
      const m = svc.getModifiers(6, "2024_six_levels");
      expect(m.dead).toBe(true);
      expect(m.d20Penalty).toBe(-12);
    });
    it("alias legado 2024_ten_levels também clampa em 6", () => {
      const m = svc.getModifiers(15, "2024_ten_levels");
      expect(m.d20Penalty).toBe(-12);
      expect(m.speedPenaltyFt).toBe(-30);
      expect(m.dead).toBe(true);
    });
  });

  describe("getLevelFromInstances", () => {
    it("retorna 0 quando sem instances", () => {
      expect(svc.getLevelFromInstances([])).toBe(0);
      expect(svc.getLevelFromInstances(undefined)).toBe(0);
    });
    it("extrai level da instance com slug exhaustion", () => {
      expect(
        svc.getLevelFromInstances([
          { slug: "poisoned" },
          { slug: "exhaustion", level: 3 },
        ]),
      ).toBe(3);
    });
    it("retorna 0 quando exhaustion sem level", () => {
      expect(svc.getLevelFromInstances([{ slug: "exhaustion" }])).toBe(0);
    });
  });
});
