import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import {
  GameResultStatusInterceptor,
  resolveGameFailureStatus,
} from "../game-result-status.interceptor";

function ctx(res: { status: jest.Mock }): ExecutionContext {
  return {
    getType: () => "http",
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function handler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe("resolveGameFailureStatus", () => {
  it.each([
    ["NOT_YOUR_TURN", 409],
    ["BONUS_ACTION_ALREADY_USED", 409],
    ["NO_USES_REMAINING", 409],
    ["ENCOUNTER_BUSY", 409],
    ["COMMAND_IN_PROGRESS", 409],
    ["FORBIDDEN_CAMPAIGN_MEMBER", 403],
    ["ENCOUNTER_NOT_FOUND", 404],
    ["UNAUTHORIZED", 401],
    ["AI_UNAVAILABLE", 503],
    ["INVALID_PAYLOAD", 400],
  ])("mapeia %s para %i", (code, expected) => {
    expect(resolveGameFailureStatus(code)).toBe(expected);
  });

  it("usa heuristica de sufixo para codigos nao catalogados", () => {
    expect(resolveGameFailureStatus("WIDGET_NOT_FOUND")).toBe(404);
    expect(resolveGameFailureStatus("FORBIDDEN_WIDGET")).toBe(403);
    expect(resolveGameFailureStatus("WIDGET_ALREADY_USED")).toBe(409);
  });

  it("cai em 400 para codigo ausente ou invalido", () => {
    expect(resolveGameFailureStatus(undefined)).toBe(400);
    expect(resolveGameFailureStatus(42)).toBe(400);
    expect(resolveGameFailureStatus("QUALQUER_COISA")).toBe(400);
  });
});

describe("GameResultStatusInterceptor", () => {
  const originalFlag = process.env.STRICT_GAME_RESULT_STATUS;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.STRICT_GAME_RESULT_STATUS;
    else process.env.STRICT_GAME_RESULT_STATUS = originalFlag;
  });

  it("nao altera status quando a flag esta desligada (default)", async () => {
    delete process.env.STRICT_GAME_RESULT_STATUS;
    const res = { status: jest.fn() };
    const interceptor = new GameResultStatusInterceptor();

    const body = { ok: false, code: "NOT_YOUR_TURN" };
    const out = await firstValueFrom(
      interceptor.intercept(ctx(res), handler(body)),
    );

    expect(out).toBe(body);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("com a flag ligada, traduz falha de dominio para status real", async () => {
    process.env.STRICT_GAME_RESULT_STATUS = "1";
    const res = { status: jest.fn() };
    const interceptor = new GameResultStatusInterceptor();

    const body = { ok: false, code: "NOT_YOUR_TURN" };
    const out = await firstValueFrom(
      interceptor.intercept(ctx(res), handler(body)),
    );

    expect(res.status).toHaveBeenCalledWith(409);
    // O corpo continua o mesmo: o cliente ainda lê `code`.
    expect(out).toBe(body);
  });

  it("nao mexe no status de resposta de sucesso", async () => {
    process.env.STRICT_GAME_RESULT_STATUS = "1";
    const res = { status: jest.fn() };
    const interceptor = new GameResultStatusInterceptor();

    await firstValueFrom(
      interceptor.intercept(ctx(res), handler({ ok: true, value: {} })),
    );

    expect(res.status).not.toHaveBeenCalled();
  });
});
