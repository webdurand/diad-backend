import { DiceService } from "../services/dice.service";

describe("DiceService", () => {
  let service: DiceService;

  beforeEach(() => {
    service = new DiceService();
  });

  afterEach(() => {
    service.clearSeed();
  });

  describe("roll", () => {
    it("should return a number between 1 and sides", () => {
      for (let i = 0; i < 100; i++) {
        const result = service.roll(20);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
      }
    });

    it("should return 0 for sides < 1", () => {
      expect(service.roll(0)).toBe(0);
      expect(service.roll(-1)).toBe(0);
    });

    it("should always return 1 for a d1", () => {
      for (let i = 0; i < 10; i++) {
        expect(service.roll(1)).toBe(1);
      }
    });
  });

  describe("deterministic seeding", () => {
    it("should produce the same sequence with the same seed", () => {
      service.setSeed(42);
      const seq1 = Array.from({ length: 10 }, () => service.roll(20));

      service.setSeed(42);
      const seq2 = Array.from({ length: 10 }, () => service.roll(20));

      expect(seq1).toEqual(seq2);
    });

    it("should produce different sequences with different seeds", () => {
      service.setSeed(42);
      const seq1 = Array.from({ length: 10 }, () => service.roll(20));

      service.setSeed(99);
      const seq2 = Array.from({ length: 10 }, () => service.roll(20));

      expect(seq1).not.toEqual(seq2);
    });

    it("should revert to non-deterministic after clearSeed", () => {
      service.setSeed(42);
      const r1 = service.roll(20);
      service.clearSeed();

      const r2 = service.roll(20);
      expect(typeof r2).toBe("number");
      expect(r2).toBeGreaterThanOrEqual(1);
      expect(r2).toBeLessThanOrEqual(20);
    });
  });

  describe("rollMultiple", () => {
    it("should return the correct number of dice", () => {
      const results = service.rollMultiple(4, 6);
      expect(results).toHaveLength(4);
      results.forEach((r) => {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      });
    });
  });

  describe("rollExpression", () => {
    it('should parse "2d6+3"', () => {
      service.setSeed(42);
      const result = service.rollExpression("2d6+3");
      expect(result.expression).toBe("2d6+3");
      expect(result.rolls).toHaveLength(2);
      expect(result.modifier).toBe(3);
      result.rolls.forEach((r) => {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      });
      expect(result.total).toBe(result.rolls.reduce((a, b) => a + b, 0) + 3);
    });

    it('should parse "1d20"', () => {
      service.setSeed(42);
      const result = service.rollExpression("1d20");
      expect(result.rolls).toHaveLength(1);
      expect(result.modifier).toBe(0);
      expect(result.total).toBe(result.rolls[0]);
    });

    it('should parse "1d20-2"', () => {
      service.setSeed(42);
      const result = service.rollExpression("1d20-2");
      expect(result.modifier).toBe(-2);
      expect(result.total).toBe(result.rolls[0] - 2);
    });

    it('should parse "4d6kh3" (keep highest 3)', () => {
      service.setSeed(42);
      const result = service.rollExpression("4d6kh3");
      expect(result.rolls).toHaveLength(4);
      expect(result.dropped).toHaveLength(1);

      const sortedDesc = [...result.rolls].sort((a, b) => b - a);
      const keptSum = sortedDesc.slice(0, 3).reduce((a, b) => a + b, 0);
      expect(result.total).toBe(keptSum);
      expect(result.dropped![0]).toBe(sortedDesc[3]);
    });

    it('should parse "2d20kl1" (keep lowest 1)', () => {
      service.setSeed(42);
      const result = service.rollExpression("2d20kl1");
      expect(result.rolls).toHaveLength(2);
      expect(result.dropped).toHaveLength(1);
      expect(result.total).toBe(Math.min(...result.rolls));
    });

    it("should handle invalid expressions gracefully", () => {
      const result = service.rollExpression("invalid");
      expect(result.total).toBe(0);
      expect(result.rolls).toEqual([]);
    });

    it('should treat literal numerics as fixed damage ("1")', () => {
      const result = service.rollExpression("1");
      expect(result.rolls).toEqual([]);
      expect(result.modifier).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should treat literal numerics as fixed damage ("5")', () => {
      const result = service.rollExpression("5");
      expect(result.total).toBe(5);
      expect(result.modifier).toBe(5);
      expect(result.rolls).toEqual([]);
    });

    it('should still parse "1d4+2" normally after literal fix', () => {
      service.setSeed(42);
      const result = service.rollExpression("1d4+2");
      expect(result.rolls).toHaveLength(1);
      expect(result.modifier).toBe(2);
      expect(result.total).toBe(result.rolls[0] + 2);
    });

    it('should still parse "2d6" normally after literal fix', () => {
      service.setSeed(42);
      const result = service.rollExpression("2d6");
      expect(result.rolls).toHaveLength(2);
      expect(result.modifier).toBe(0);
      expect(result.total).toBe(result.rolls.reduce((a, b) => a + b, 0));
    });

    it("should be deterministic with seed", () => {
      service.setSeed(123);
      const r1 = service.rollExpression("2d6+3");

      service.setSeed(123);
      const r2 = service.rollExpression("2d6+3");

      expect(r1).toEqual(r2);
    });
  });

  describe("rollWithAdvantage", () => {
    it("should return the higher of two d20 rolls", () => {
      service.setSeed(42);
      const result = service.rollWithAdvantage();
      expect(result.chosen).toBe(Math.max(result.roll1, result.roll2));
      expect(result.discarded).toBe(Math.min(result.roll1, result.roll2));
      expect(result.roll1).toBeGreaterThanOrEqual(1);
      expect(result.roll1).toBeLessThanOrEqual(20);
      expect(result.roll2).toBeGreaterThanOrEqual(1);
      expect(result.roll2).toBeLessThanOrEqual(20);
    });
  });

  describe("rollWithDisadvantage", () => {
    it("should return the lower of two d20 rolls", () => {
      service.setSeed(42);
      const result = service.rollWithDisadvantage();
      expect(result.chosen).toBe(Math.min(result.roll1, result.roll2));
      expect(result.discarded).toBe(Math.max(result.roll1, result.roll2));
    });
  });

  describe("rollInitiative", () => {
    it("should return roll + modifier", () => {
      service.setSeed(42);
      const result = service.rollInitiative(3);
      expect(result.modifier).toBe(3);
      expect(result.total).toBe(result.roll + 3);
      expect(result.roll).toBeGreaterThanOrEqual(1);
      expect(result.roll).toBeLessThanOrEqual(20);
    });

    it("should handle negative modifiers", () => {
      service.setSeed(42);
      const result = service.rollInitiative(-2);
      expect(result.total).toBe(result.roll - 2);
    });
  });
});
