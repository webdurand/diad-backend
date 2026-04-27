import { ForbiddenException } from "@nestjs/common";
import { NonProductionGuard } from "./non-production.guard";

describe("NonProductionGuard", () => {
  let guard: NonProductionGuard;
  const originalEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ALLOW_TEST_ENDPOINTS;

  beforeEach(() => {
    guard = new NonProductionGuard();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.ALLOW_TEST_ENDPOINTS = originalOverride;
  });

  it("libera em development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_TEST_ENDPOINTS;
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it("libera em test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_TEST_ENDPOINTS;
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it("libera em ambiente indefinido", () => {
    delete process.env.NODE_ENV;
    delete process.env.ALLOW_TEST_ENDPOINTS;
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it("bloqueia em production sem override", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_TEST_ENDPOINTS;
    expect(() => guard.canActivate({} as never)).toThrow(ForbiddenException);
  });

  it("libera em production com ALLOW_TEST_ENDPOINTS=true", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TEST_ENDPOINTS = "true";
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it("bloqueia em production com ALLOW_TEST_ENDPOINTS=false", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TEST_ENDPOINTS = "false";
    expect(() => guard.canActivate({} as never)).toThrow(ForbiddenException);
  });

  it("bloqueia em production com ALLOW_TEST_ENDPOINTS vazio", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TEST_ENDPOINTS = "";
    expect(() => guard.canActivate({} as never)).toThrow(ForbiddenException);
  });

  it("retorna payload estruturado ao bloquear", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_TEST_ENDPOINTS;
    try {
      guard.canActivate({} as never);
      fail("esperava ForbiddenException");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe("DISABLED_IN_PRODUCTION");
      expect(response.message).toContain("produção");
    }
  });
});
