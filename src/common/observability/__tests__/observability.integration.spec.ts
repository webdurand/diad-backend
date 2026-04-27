import { INestApplication, Module, Controller, Get } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ClsModule } from "nestjs-cls";
import { LoggerModule } from "nestjs-pino";
import { DiadLogger } from "../logger/diad-logger.service";
import { ProblemFactory } from "../errors/problem.factory";
import { GlobalExceptionFilter } from "../errors/global-exception.filter";
import { TraceContextMiddleware } from "../trace/trace-context.middleware";
import { DiadException, UpstreamException } from "../errors/diad-exception";
import { ErrorCode } from "../errors/error-codes.catalog";
import { generateTraceId, TRACEPARENT_HEADER } from "../trace/trace-context";
import { OutboundFetch } from "../http/outbound-fetch.service";

@Controller("test")
class FakeController {
  @Get("boom")
  boom(): never {
    throw new Error("Agent service responded with 500");
  }

  @Get("upstream")
  upstream(): never {
    throw new UpstreamException(
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
      },
    );
  }

  @Get("domain-404")
  notFound(): never {
    throw new DiadException(
      ErrorCode.CHARACTER_NOT_FOUND,
      "Personagem inexistente",
    );
  }

  @Get("ok")
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => generateTraceId(),
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: "silent",
        base: { "service.name": "diad-backend" },
      },
    }),
  ],
  controllers: [FakeController],
  providers: [DiadLogger, ProblemFactory, OutboundFetch, GlobalExceptionFilter],
})
class IntegrationModule {
  configure(consumer: import("@nestjs/common").MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware).forRoutes("*");
  }
}

describe("Observability — integration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IntegrationModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(app.get(GlobalExceptionFilter));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET sem traceparent gera novo e ecoa no response", async () => {
    const res = await request(app.getHttpServer()).get("/test/ok");
    expect(res.status).toBe(200);
    expect(res.headers[TRACEPARENT_HEADER]).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
  });

  it("GET com traceparent válido preserva trace-id no response header", async () => {
    const incoming = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const res = await request(app.getHttpServer())
      .get("/test/ok")
      .set(TRACEPARENT_HEADER, incoming);
    const echoed = res.headers[TRACEPARENT_HEADER];
    expect(echoed.startsWith("00-0af7651916cd43dd8448eb211c80319c-")).toBe(
      true,
    );
  });

  it("AC1 caso motivador: UpstreamException → 502 problem+json com context.upstream", async () => {
    const res = await request(app.getHttpServer()).get("/test/upstream");
    expect(res.status).toBe(502);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe("AGENT_UPSTREAM_ERROR");
    expect(res.body.detail).toBe(
      "Falha ao criar campanha — session_id nao encontrado",
    );
    expect(res.body.context.upstream.service).toBe("diad-agents");
    expect(res.body.context.upstream.status).toBe(500);
    expect(res.body.context.upstream.body).toEqual({
      error: "Falha ao criar campanha — session_id nao encontrado",
    });
    expect(res.body.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("Error cru não tratado → 500 SYSTEM_INTERNAL_ERROR (não morre como genérico)", async () => {
    const res = await request(app.getHttpServer()).get("/test/boom");
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe("SYSTEM_INTERNAL_ERROR");
    expect(res.body.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("DiadException 404 → envelope com code de domínio", async () => {
    const res = await request(app.getHttpServer()).get("/test/domain-404");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CHARACTER_NOT_FOUND");
    expect(res.body.context).toBeUndefined();
  });

  it("schema compliance: type + title + status + code + traceId presentes", async () => {
    const res = await request(app.getHttpServer()).get("/test/upstream");
    const env = res.body;
    expect(env.type).toMatch(/^https:\/\/diad\.dev\/errors\//);
    expect(typeof env.title).toBe("string");
    expect(env.title.length).toBeGreaterThan(0);
    expect(env.status).toBeGreaterThanOrEqual(400);
    expect(env.code).toMatch(/^[A-Z]+(_[A-Z0-9]+)+$/);
    expect(env.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("LEGACY_ERROR_ENVELOPE default ON: envelope inclui ok/error legacy", async () => {
    const res = await request(app.getHttpServer()).get("/test/upstream");
    expect(res.body.ok).toBe(false);
    expect(typeof res.body.error).toBe("string");
  });
});
