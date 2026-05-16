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
  it("contém os codes do catálogo canônico", () => {
    expect(ALL_ERROR_CODES.length).toBe(84);
  });

  it("todos os codes seguem o regex SCREAMING_SNAKE", () => {
    const regex = /^[A-Z]+(_[A-Z0-9]+)+$/;
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(regex);
    }
  });

  it("todos os codes têm metadata com httpStatus válido (200 warning ou 4xx/5xx)", () => {

    for (const code of ALL_ERROR_CODES) {
      const md = getMetadata(code);
      const isWarning = md.httpStatus === 200;
      const isError = md.httpStatus >= 400 && md.httpStatus <= 599;
      expect(isWarning || isError).toBe(true);
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
