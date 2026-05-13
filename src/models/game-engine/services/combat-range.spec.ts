import {
  parseRangeString,
  chebyshevDistanceFt,
  checkAttackRange,
  type Position,
} from "./combat-range";



describe("parseRangeString", () => {
  it("parsa melee 5ft", () => {
    expect(parseRangeString("5 ft")).toEqual({ normal: 5 });
    expect(parseRangeString("5 ft.")).toEqual({ normal: 5 });
  });

  it("parsa reach 10ft", () => {
    expect(parseRangeString("10 ft")).toEqual({ normal: 10 });
  });

  it("parsa ranged normal/long", () => {
    expect(parseRangeString("150/600 ft")).toEqual({ normal: 150, long: 600 });
    expect(parseRangeString("20/60 ft.")).toEqual({ normal: 20, long: 60 });
  });

  it("trata Self como 0ft", () => {
    expect(parseRangeString("Self")).toEqual({ normal: 0 });
  });

  it("trata Touch como 5ft", () => {
    expect(parseRangeString("Touch")).toEqual({ normal: 5 });
  });

  it("retorna null em string vazia ou lixo", () => {
    expect(parseRangeString("")).toBeNull();
    expect(parseRangeString("???")).toBeNull();
  });
});

describe("chebyshevDistanceFt", () => {
  it("mesma cell = 0ft", () => {
    expect(chebyshevDistanceFt({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it("adjacente horizontal = 5ft", () => {
    expect(chebyshevDistanceFt({ x: 5, y: 5 }, { x: 6, y: 5 })).toBe(5);
  });

  it("adjacente diagonal = 5ft (RAW 5e: diagonal conta como 1 cell)", () => {
    expect(chebyshevDistanceFt({ x: 5, y: 5 }, { x: 6, y: 6 })).toBe(5);
  });

  it("26 cells horizontal = 130ft", () => {
    expect(chebyshevDistanceFt({ x: 5, y: 5 }, { x: 31, y: 5 })).toBe(130);
  });
});

describe("checkAttackRange", () => {
  const pcAt = (x: number, y: number): Position => ({ x, y });

  it("melee 5ft a 1 cell → OK sem disadvantage", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(6, 5), { normal: 5 });
    expect(result.ok).toBe(true);
    expect(result.disadvantage).toBe(false);
    expect(result.distanceFt).toBe(5);
  });

  it("melee 5ft a 10ft → fora de alcance", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(7, 5), { normal: 5 });
    expect(result.ok).toBe(false);
    expect(result.distanceFt).toBe(10);
    expect(result.maxFt).toBe(5);
  });

  it("reach 10ft a 2 cells → OK", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(7, 5), { normal: 10 });
    expect(result.ok).toBe(true);
    expect(result.distanceFt).toBe(10);
  });

  it("ranged 150/600 a 80ft (dentro de normal) → OK sem disadv", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(21, 5), {
      normal: 150,
      long: 600,
    });
    expect(result.ok).toBe(true);
    expect(result.disadvantage).toBe(false);
    expect(result.distanceFt).toBe(80);
  });

  it("ranged 150/600 a 300ft (entre normal e long) → OK com disadvantage", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(65, 5), {
      normal: 150,
      long: 600,
    });
    expect(result.ok).toBe(true);
    expect(result.disadvantage).toBe(true);
    expect(result.distanceFt).toBe(300);
  });

  it("ranged 150/600 a 700ft → fora de long", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(145, 5), {
      normal: 150,
      long: 600,
    });
    expect(result.ok).toBe(false);
    expect(result.distanceFt).toBe(700);
    expect(result.maxFt).toBe(600);
  });

  it("positions ausentes → passa sem checar (encontros sem grid)", () => {
    const result = checkAttackRange(null, pcAt(6, 5), { normal: 5 });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it("range ausente (null) → trata como melee 5ft", () => {
    const farResult = checkAttackRange(pcAt(5, 5), pcAt(10, 5), null);
    expect(farResult.ok).toBe(false);
    expect(farResult.maxFt).toBe(5);
  });

  it("reprodução fighter-L1-range-check: Unarmed a 130ft → REJEITA", () => {
    const result = checkAttackRange(pcAt(5, 5), pcAt(31, 5), { normal: 5 });
    expect(result.ok).toBe(false);
    expect(result.distanceFt).toBe(130);
    expect(result.maxFt).toBe(5);
  });
});
