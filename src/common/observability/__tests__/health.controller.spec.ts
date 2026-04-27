import type { Response } from "express";
import { ClsService } from "nestjs-cls";
import { HealthController } from "../health/health.controller";

function makeCls(): ClsService {
  return {
    isActive: () => true,
    get: () => "a".repeat(32),
  } as unknown as ClsService;
}

interface FakeRes {
  status: jest.Mock;
  setHeader: jest.Mock;
  json: jest.Mock;
}

function makeRes(): FakeRes {
  const r: FakeRes = {
    status: jest.fn(),
    setHeader: jest.fn(),
    json: jest.fn(),
  };
  r.status.mockReturnValue(r);
  r.setHeader.mockReturnValue(r);
  return r;
}

describe("HealthController", () => {
  it("healthz retorna status=ok service=diad-backend", () => {
    const ctrl = new HealthController({ query: jest.fn() } as never, makeCls());
    const out = ctrl.healthz();
    expect(out.status).toBe("ok");
    expect(out.service).toBe("diad-backend");
    expect(out.traceId).toBe("a".repeat(32));
    expect(typeof out.timestamp).toBe("string");
  });

  it("readyz 200 quando SELECT 1 ok", async () => {
    const ds = { query: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const ctrl = new HealthController(ds as never, makeCls());
    const res = makeRes();
    await ctrl.readyz(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe("ok");
  });

  it("readyz 503 envelope quando DB falha", async () => {
    const ds = {
      query: jest.fn().mockRejectedValue(new Error("connection refused")),
    };
    const ctrl = new HealthController(ds as never, makeCls());
    const res = makeRes();
    await ctrl.readyz(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/problem+json",
    );
    const env = res.json.mock.calls[0][0];
    expect(env.code).toBe("SYSTEM_UNAVAILABLE");
    expect(env.status).toBe(503);
    expect(env.detail).toContain("connection refused");
  });
});
