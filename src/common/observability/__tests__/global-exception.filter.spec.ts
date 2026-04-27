import {
  ArgumentsHost,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import { GlobalExceptionFilter } from "../errors/global-exception.filter";
import { ProblemFactory } from "../errors/problem.factory";
import { DiadLogger } from "../logger/diad-logger.service";
import { DiadException, UpstreamException } from "../errors/diad-exception";
import { ErrorCode } from "../errors/error-codes.catalog";

function makeCls(values: Record<string, string> = {}): ClsService {
  return {
    isActive: () => true,
    get: (k: string) => values[k],
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

interface FakeRes {
  setHeader: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
}

function makeHost(req: Request, res: FakeRes): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("GlobalExceptionFilter", () => {
  it("Error cru → 500 + SYSTEM_INTERNAL_ERROR + log error", () => {
    const cls = makeCls({ traceId: "a".repeat(32) });
    const logger = makeLogger();
    const filter = new GlobalExceptionFilter(new ProblemFactory(cls), logger);
    const res = makeRes();
    const req = { url: "/api/x" } as Request;
    filter.catch(new Error("boom"), makeHost(req, res));
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/problem+json",
    );
    expect(res.status).toHaveBeenCalledWith(500);
    const env = res.json.mock.calls[0][0];
    expect(env.code).toBe(ErrorCode.SYSTEM_INTERNAL_ERROR);
    expect(env.status).toBe(500);
    expect(env.traceId).toBe("a".repeat(32));
    expect(logger.error).toHaveBeenCalled();
  });

  it("DiadException → status custom + envelope", () => {
    const cls = makeCls({ traceId: "b".repeat(32) });
    const filter = new GlobalExceptionFilter(
      new ProblemFactory(cls),
      makeLogger(),
    );
    const res = makeRes();
    const exc = new DiadException(
      ErrorCode.CHARACTER_NOT_FOUND,
      "Personagem não existe",
    );
    filter.catch(exc, makeHost({ url: "/x" } as Request, res));
    expect(res.status).toHaveBeenCalledWith(404);
    const env = res.json.mock.calls[0][0];
    expect(env.code).toBe(ErrorCode.CHARACTER_NOT_FOUND);
  });

  it("HttpException 4xx legado loga warn (não error)", () => {
    const cls = makeCls({ traceId: "c".repeat(32) });
    const logger = makeLogger();
    const filter = new GlobalExceptionFilter(new ProblemFactory(cls), logger);
    const res = makeRes();
    filter.catch(
      new NotFoundException("x"),
      makeHost({ url: "/" } as Request, res),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("caso motivador (AC1): UpstreamException com cause + body upstream", () => {
    const cls = makeCls({ traceId: "0af7651916cd43dd8448eb211c80319c" });
    const filter = new GlobalExceptionFilter(
      new ProblemFactory(cls),
      makeLogger(),
    );
    const res = makeRes();
    const cause = new Error("Agent service responded with 500");
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
    filter.catch(exc, makeHost({ url: "/api/ai/solo/create" } as Request, res));
    expect(res.status).toHaveBeenCalledWith(502);
    const env = res.json.mock.calls[0][0];
    expect(env.code).toBe(ErrorCode.AGENT_UPSTREAM_ERROR);
    expect(env.detail).toBe(
      "Falha ao criar campanha — session_id nao encontrado",
    );
    expect(env.context.upstream.service).toBe("diad-agents");
    expect(env.context.upstream.status).toBe(500);
    expect(env.context.upstream.body).toEqual({
      error: "Falha ao criar campanha — session_id nao encontrado",
    });
    expect(env.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("respeita HttpException com body string", () => {
    const cls = makeCls({ traceId: "d".repeat(32) });
    const filter = new GlobalExceptionFilter(
      new ProblemFactory(cls),
      makeLogger(),
    );
    const res = makeRes();
    filter.catch(
      new HttpException("plain string", 418),
      makeHost({ url: "/" } as Request, res),
    );
    expect(res.status).toHaveBeenCalledWith(418);
  });
});
