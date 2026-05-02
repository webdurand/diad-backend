import type { NextFunction, Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import { TraceContextMiddleware } from "../trace/trace-context.middleware";
import { DiadLogger } from "../logger/diad-logger.service";
import { TRACEPARENT_HEADER } from "../trace/trace-context";

interface ClsStore {
  active: boolean;
  values: Record<string, unknown>;
}

function makeCls(store: ClsStore): ClsService {
  return {
    isActive: () => store.active,
    set: (k: string, v: unknown) => {
      store.values[k] = v;
    },
    get: (k: string) => store.values[k],
  } as unknown as ClsService;
}

function makeLogger(): DiadLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as DiadLogger;
}

function makeReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers, method: "GET", url: "/api/x" } as unknown as Request;
}

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    headers,
  } as unknown as Response & { headers: Record<string, string> };
}

describe("TraceContextMiddleware", () => {
  it("sem header → gera traceparent novo, popula CLS e ecoa response", () => {
    const store: ClsStore = { active: true, values: {} };
    const mw = new TraceContextMiddleware(makeCls(store));
    const res = makeRes();
    const next: NextFunction = jest.fn();
    mw.use(makeReq(), res, next);

    expect(next).toHaveBeenCalled();
    expect(store.values.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(store.values.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(store.values["trace.origin"]).toBe("generated");
    const echoed = (res as unknown as { headers: Record<string, string> })
      .headers[TRACEPARENT_HEADER];
    expect(echoed).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("header válido → preserva traceId, marca origin=inherited", () => {
    const store: ClsStore = { active: true, values: {} };
    const mw = new TraceContextMiddleware(makeCls(store));
    const incoming = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const res = makeRes();
    mw.use(makeReq({ traceparent: incoming }), res, jest.fn() as NextFunction);

    expect(store.values.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(store.values.parentSpanId).toBe("b7ad6b7169203331");
    expect(store.values["trace.origin"]).toBe("inherited");
    const echoed = (res as unknown as { headers: Record<string, string> })
      .headers[TRACEPARENT_HEADER];
    expect(echoed.startsWith("00-0af7651916cd43dd8448eb211c80319c-")).toBe(
      true,
    );
  });

  it("header inválido → gera novo (origin=generated)", () => {
    const store: ClsStore = { active: true, values: {} };
    const mw = new TraceContextMiddleware(makeCls(store));
    const res = makeRes();
    mw.use(makeReq({ traceparent: "garbage" }), res, jest.fn() as NextFunction);
    expect(store.values["trace.origin"]).toBe("generated");
    expect(store.values.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("CLS inativo não quebra (try/catch)", () => {
    const store: ClsStore = { active: false, values: {} };
    const cls = {
      isActive: () => store.active,
      set: () => {
        throw new Error("cls inactive");
      },
      get: () => undefined,
    } as unknown as ClsService;
    const mw = new TraceContextMiddleware(cls);
    const next: NextFunction = jest.fn();
    expect(() => mw.use(makeReq(), makeRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
