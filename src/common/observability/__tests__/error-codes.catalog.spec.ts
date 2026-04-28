import {
  ALL_ERROR_CODES,
  ErrorCode,
  assertNever,
  isErrorCode,
} from "../errors/error-codes.catalog";
import {
  ERROR_CODE_METADATA,
  getMetadata,
} from "../errors/error-codes.metadata";

describe("Error Codes Catalog", () => {
  it("contém os 33 codes do catálogo canônico", () => {
    // Spec 017 adicionou EVENT_TYPE_NOT_REGISTERED + TRACE_ID_INVALID.
    // Spec 019 adicionou WEATHER_INVALID_BIOME, CLOCK_NEGATIVE_HOURS,
    // CHAOS_OUT_OF_RANGE, SPELL_BLOCKED_DEAD_MAGIC.
    expect(ALL_ERROR_CODES.length).toBe(33);
  });

  it("todos os codes seguem o regex SCREAMING_SNAKE", () => {
    const regex = /^[A-Z]+(_[A-Z0-9]+)+$/;
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(regex);
    }
  });

  it("todos os codes têm metadata com httpStatus em [400, 599]", () => {
    for (const code of ALL_ERROR_CODES) {
      const md = getMetadata(code);
      expect(md.httpStatus).toBeGreaterThanOrEqual(400);
      expect(md.httpStatus).toBeLessThanOrEqual(599);
      expect(md.defaultTitle.length).toBeGreaterThan(0);
      expect(md.domain.length).toBeGreaterThan(0);
    }
  });

  it("isErrorCode detecta strings válidas e rejeita inválidas", () => {
    expect(isErrorCode(ErrorCode.AGENT_UPSTREAM_ERROR)).toBe(true);
    expect(isErrorCode("NOPE")).toBe(false);
    expect(isErrorCode(123)).toBe(false);
    expect(isErrorCode(null)).toBe(false);
  });

  it("assertNever lança ao receber valor inesperado", () => {
    expect(() => assertNever("boom" as never, "unhandled")).toThrow(
      /unhandled/,
    );
  });

  it("cobertura: todo code aparece em ERROR_CODE_METADATA", () => {
    for (const code of ALL_ERROR_CODES) {
      expect(ERROR_CODE_METADATA[code]).toBeDefined();
    }
  });
});
