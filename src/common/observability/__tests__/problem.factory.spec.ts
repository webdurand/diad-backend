import { ClsService } from "nestjs-cls";
import {
  HttpException,
  BadRequestException,
  NotFoundException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { ProblemFactory } from "../errors/problem.factory";
import { DiadException, UpstreamException } from "../errors/diad-exception";
import { ErrorCode } from "../errors/error-codes.catalog";

function makeCls(values: Record<string, string> = {}): ClsService {
  return {
    isActive: () => true,
    get: (key: string) => values[key],
  } as unknown as ClsService;
}

function makeRequest(url = "/x"): Request {
  return { url, originalUrl: url } as unknown as Request;
}

describe("ProblemFactory", () => {
  beforeEach(() => {
    delete process.env.LEGACY_ERROR_ENVELOPE;
  });

  it("fromException(DiadException) → envelope completo + traceId do CLS", () => {
    const cls = makeCls({ traceId: "a".repeat(32), spanId: "b".repeat(16) });
    const factory = new ProblemFactory(cls);
    const exc = new DiadException(
      ErrorCode.CAMPAIGN_NOT_FOUND,
      "Campanha xpto não existe.",
      { context: { campaignId: "cmp_1" } },
    );
    const env = factory.fromException(exc, makeRequest("/api/campaigns/cmp_1"));
    expect(env.code).toBe(ErrorCode.CAMPAIGN_NOT_FOUND);
    expect(env.status).toBe(404);
    expect(env.detail).toBe("Campanha xpto não existe.");
    expect(env.traceId).toBe("a".repeat(32));
    expect(env.spanId).toBe("b".repeat(16));
    expect(env.type).toBe("https://diad.dev/errors/CAMPAIGN_NOT_FOUND");
    expect(env.context).toEqual({ campaignId: "cmp_1" });
  });

  it("fromException(UpstreamException) preserva context.upstream integralmente", () => {
    const cls = makeCls({ traceId: "c".repeat(32) });
    const factory = new ProblemFactory(cls);
    const cause = new Error("socket hang up");
    const exc = new UpstreamException(
      ErrorCode.AGENT_UPSTREAM_ERROR,
      "Falha ao criar campanha — session_id nao encontrado",
      {
        upstream: {
          service: "diad-agents",
          status: 500,
          body: {
            error: "Falha ao criar campanha — session_id nao encontrado",
          },
        },
        cause,
      },
    );
    const env = factory.fromException(exc, makeRequest("/api/ai/solo/create"));
    expect(env.code).toBe(ErrorCode.AGENT_UPSTREAM_ERROR);
    expect(env.status).toBe(502);
    expect(env.context?.upstream?.service).toBe("diad-agents");
    expect(env.context?.upstream?.status).toBe(500);
    expect(env.context?.upstream?.body).toEqual({
      error: "Falha ao criar campanha — session_id nao encontrado",
    });
  });

  it("fromException(BadRequestException) com {ok,error,code} legado → mapeia code", () => {
    const cls = makeCls({ traceId: "d".repeat(32) });
    const factory = new ProblemFactory(cls);
    const exc = new BadRequestException({
      ok: false,
      error: "Falta nome.",
      code: "VALIDATION_INVALID_PAYLOAD",
    });
    const env = factory.fromException(exc, makeRequest("/api/x"));
    expect(env.code).toBe("VALIDATION_INVALID_PAYLOAD");
    expect(env.detail).toBe("Falta nome.");
    expect(env.status).toBe(400);
  });

  it("fromException(NotFoundException) sem code → fallback por status", () => {
    const cls = makeCls({ traceId: "e".repeat(32) });
    const factory = new ProblemFactory(cls);
    const exc = new NotFoundException("nao tem");
    const env = factory.fromException(exc, makeRequest("/api/y"));
    expect(env.status).toBe(404);
    expect(env.detail).toBe("nao tem");
  });

  it("fromUnknown(Error) → SYSTEM_INTERNAL_ERROR", () => {
    const cls = makeCls({ traceId: "f".repeat(32) });
    const factory = new ProblemFactory(cls);
    const env = factory.fromUnknown(new Error("boom"), makeRequest("/api/z"));
    expect(env.code).toBe(ErrorCode.SYSTEM_INTERNAL_ERROR);
    expect(env.status).toBe(500);
    expect(env.detail).toBe("boom");
  });

  it("fromValidation → errors[]", () => {
    const cls = makeCls({ traceId: "1".repeat(32) });
    const factory = new ProblemFactory(cls);
    const env = factory.fromValidation(
      ["nome obrigatório", "email invalido"],
      makeRequest("/api/users"),
    );
    expect(env.code).toBe(ErrorCode.VALIDATION_INVALID_PAYLOAD);
    expect(env.errors).toHaveLength(2);
    expect(env.errors?.[0]).toMatchObject({ message: "nome obrigatório" });
  });

  it("LEGACY_ERROR_ENVELOPE=true (default) merge ok/error", () => {
    const cls = makeCls({ traceId: "2".repeat(32) });
    const factory = new ProblemFactory(cls);
    const env = factory.fromUnknown(new Error("crash"), makeRequest("/x"));
    expect(env.ok).toBe(false);
    expect(env.error).toBe("crash");
  });

  it("LEGACY_ERROR_ENVELOPE=false omite campos legados", () => {
    process.env.LEGACY_ERROR_ENVELOPE = "false";
    const cls = makeCls({ traceId: "3".repeat(32) });
    const factory = new ProblemFactory(cls);
    const env = factory.fromUnknown(new Error("crash"), makeRequest("/x"));
    expect(env.ok).toBeUndefined();
    expect(env.error).toBeUndefined();
    delete process.env.LEGACY_ERROR_ENVELOPE;
  });

  it("gera traceId fallback se CLS vazio", () => {
    const cls = {
      isActive: () => false,
      get: () => undefined,
    } as unknown as ClsService;
    const factory = new ProblemFactory(cls);
    const env = factory.fromUnknown(new Error("x"), makeRequest("/"));
    expect(env.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("envelope tem campos required (type, title, status, code, traceId)", () => {
    const cls = makeCls({ traceId: "5".repeat(32) });
    const factory = new ProblemFactory(cls);
    const env = factory.fromException(
      new DiadException(ErrorCode.AUTH_TOKEN_MISSING, "sem token", {}),
      makeRequest("/api"),
    );
    expect(env.type).toBeDefined();
    expect(env.title).toBeDefined();
    expect(env.status).toBeGreaterThanOrEqual(400);
    expect(env.code).toBeDefined();
    expect(env.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("mapeia 429 → SYSTEM_RATE_LIMITED", () => {
    const cls = makeCls({ traceId: "6".repeat(32) });
    const factory = new ProblemFactory(cls);
    const exc = new HttpException("slow down", HttpStatus.TOO_MANY_REQUESTS);
    const env = factory.fromException(exc, makeRequest("/"));
    expect(env.code).toBe(ErrorCode.SYSTEM_RATE_LIMITED);
  });
});
