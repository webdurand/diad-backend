import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AdminGuard } from "../admin.guard";

function createMockContext(user?: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("AdminGuard", () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it("should allow access when user has admin role", () => {
    const ctx = createMockContext({ id: "1", email: "a@b.com", role: "admin" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("should deny access when user has user role", () => {
    const ctx = createMockContext({ id: "1", email: "a@b.com", role: "user" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("should deny access when user has no role", () => {
    const ctx = createMockContext({ id: "1", email: "a@b.com" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("should deny access when no user is present", () => {
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("should throw ForbiddenException with correct message", () => {
    const ctx = createMockContext({ id: "1", email: "a@b.com", role: "user" });
    expect(() => guard.canActivate(ctx)).toThrow(
      "Acesso restrito a administradores.",
    );
  });
});
