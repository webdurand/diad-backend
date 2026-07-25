import { validateFireStormLayout } from "./fire-storm";

describe("Fire Storm layout", () => {
  it("aceita uma cadeia conectada de até dez cubos de 10 pés", () => {
    const origins = Array.from({ length: 10 }, (_, index) => ({
      x: index * 2,
      y: 0,
    }));
    expect(
      validateFireStormLayout(origins, {
        columns: 20,
        rows: 20,
        caster: { x: 10, y: 10 },
      }),
    ).toEqual({ ok: true, origins });
  });

  it("rejeita sobreposição, desconexão e cubos fora do mapa", () => {
    expect(
      validateFireStormLayout(
        [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
        { columns: 20, rows: 20 },
      ),
    ).toMatchObject({ ok: false, message: expect.stringContaining("sobrepor") });
    expect(
      validateFireStormLayout(
        [
          { x: 2, y: 2 },
          { x: 6, y: 2 },
        ],
        { columns: 20, rows: 20 },
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("compartilhar uma face"),
    });
    expect(
      validateFireStormLayout([{ x: 19, y: 19 }], {
        columns: 20,
        rows: 20,
      }),
    ).toMatchObject({ ok: false, code: "POSITION_OUT_OF_BOUNDS" });
  });

  it("rejeita mais de dez cubos e posições além de 150 pés", () => {
    expect(
      validateFireStormLayout(
        Array.from({ length: 11 }, (_, index) => ({ x: index * 2, y: 0 })),
        { columns: 40, rows: 40 },
      ),
    ).toMatchObject({ ok: false, code: "INVALID_ACTION" });
    expect(
      validateFireStormLayout([{ x: 31, y: 0 }], {
        columns: 40,
        rows: 40,
        caster: { x: 0, y: 0 },
      }),
    ).toMatchObject({ ok: false, code: "SPELL_OUT_OF_RANGE" });
  });
});
