import { ConfigService } from "@nestjs/config";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { UpstreamException } from "src/common/observability/errors/diad-exception";
import { SessionRecapService } from "../session-recap.service";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function buildService(opts: {
  session?: Partial<GameSessionEntity> | null;
  messageCount?: number;
  messages?: Partial<SessionMessageEntity>[];
  outboundResolves?: unknown;
  outboundRejects?: Error;
  lockAcquired?: boolean;
}): {
  service: SessionRecapService;
  sessionRepo: { findOne: jest.Mock; update: jest.Mock };
  messageRepo: { count: jest.Mock };
  outbound: { request: jest.Mock };
  queries: string[];
  transactionFn: jest.Mock;
  createQueryRunner: jest.Mock;
} {
  const sessionRepo = {
    findOne: jest.fn().mockResolvedValue(opts.session ?? null),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const messageRepo = {
    count: jest.fn().mockResolvedValue(opts.messageCount ?? 0),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        where: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getMany: jest.fn().mockResolvedValue(opts.messages ?? []),
      };
      return qb;
    }),
  };
  const outbound = {
    request: jest.fn(async () => {
      if (opts.outboundRejects) throw opts.outboundRejects;
      return opts.outboundResolves ?? { summaryText: "" };
    }),
  };
  const lockAcquired = opts.lockAcquired ?? true;
  const queries: string[] = [];
  const txManager = {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      if (sql.includes("advisory")) {
        return Promise.resolve([{ got: lockAcquired }]);
      }
      return Promise.resolve([]);
    }),
  };
  const transactionFn = jest.fn((cb: (m: unknown) => unknown) => cb(txManager));
  const createQueryRunner = jest.fn();
  const dataSource: any = {
    transaction: transactionFn,
    createQueryRunner,
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as DiadLogger;
  const config = {
    get: jest.fn((key: string) => {
      if (key === "AGENT_BASE_URL") return "http://localhost:9003";
      if (key === "INTERNAL_AGENTS_TOKEN") return "test-token";
      return undefined;
    }),
  } as unknown as ConfigService;
  const service = new SessionRecapService(
    sessionRepo as any,
    messageRepo as any,
    dataSource,
    outbound as unknown as OutboundFetch,
    logger,
    config,
  );
  return {
    service,
    sessionRepo,
    messageRepo,
    outbound,
    queries,
    transactionFn,
    createQueryRunner,
  };
}

describe("SessionRecapService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna cached quando summaryText já existe (sem chamar agents)", async () => {
    const { service, outbound } = buildService({
      session: {
        id: SESSION_ID,
        campaignId: "c-1",
        summaryText: "Resumo já cacheado",
      },
    });
    const result = await service.ensureRecap(SESSION_ID);
    expect(result).toEqual({
      status: "cached",
      summaryText: "Resumo já cacheado",
    });
    expect(outbound.request).not.toHaveBeenCalled();
  });

  it("retorna skipped_too_few_messages quando count < 10", async () => {
    const { service, outbound } = buildService({
      session: { id: SESSION_ID, campaignId: "c-1", summaryText: undefined },
      messageCount: 5,
    });
    const result = await service.ensureRecap(SESSION_ID);
    expect(result).toEqual({
      status: "skipped_too_few_messages",
      messageCount: 5,
    });
    expect(outbound.request).not.toHaveBeenCalled();
  });

  it("segura o lock como xact dentro de dataSource.transaction, sem unlock manual", async () => {
    const ctx = buildService({
      session: {
        id: SESSION_ID,
        campaignId: "c-1",
        summaryText: "Resumo já cacheado",
      },
    });

    await ctx.service.ensureRecap(SESSION_ID);

    // O pooler PgBouncer da Neon é transaction-mode: statements soltos podem cair
    // em backends diferentes, então o lock só é confiável se for xact-scoped e
    // liberado pelo COMMIT — nunca por um pg_advisory_unlock em outro statement.
    expect(ctx.transactionFn).toHaveBeenCalledTimes(1);
    expect(ctx.createQueryRunner).not.toHaveBeenCalled();
    expect(ctx.queries[0]).toContain("pg_try_advisory_xact_lock");
    expect(ctx.queries.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(
      false,
    );
  });

  it("continua sem bloquear quando o lock está tomado (try, não wait)", async () => {
    const { service, queries } = buildService({ lockAcquired: false });

    await service.ensureRecap(SESSION_ID);

    // ensureRecap roda dentro do request de narração: esperar pelo lock somaria a
    // latência do summarize alheio à resposta do jogador.
    expect(queries[0]).not.toMatch(/pg_advisory_xact_lock\s*\(/);
    expect(queries[0]).toContain("pg_try_advisory_xact_lock");
  });

  it("retorna skipped_locked quando outro processo segura o lock", async () => {
    const { service, outbound, sessionRepo } = buildService({
      lockAcquired: false,
    });
    const result = await service.ensureRecap(SESSION_ID);
    expect(result).toEqual({ status: "skipped_locked" });
    expect(sessionRepo.findOne).not.toHaveBeenCalled();
    expect(outbound.request).not.toHaveBeenCalled();
  });

  it("retorna skipped_not_found quando session não existe", async () => {
    const { service } = buildService({ session: null });
    const result = await service.ensureRecap(SESSION_ID);
    expect(result).toEqual({ status: "skipped_not_found" });
  });

  it("dispara agents.summarize quando NULL e ≥10 messages, persistindo resultado", async () => {
    const messages = Array.from({ length: 12 }).map((_, i) => ({
      id: `m-${i}`,
      sessionId: SESSION_ID,
      kind: (i % 2 === 0 ? "narration" : "player_action") as any,
      content: `mensagem ${i}`,
      sequenceNumber: i + 1,
    }));
    const { service, sessionRepo, outbound } = buildService({
      session: { id: SESSION_ID, campaignId: "c-1", summaryText: undefined },
      messageCount: 12,
      messages,
      outboundResolves: {
        summaryText: "Resumo gerado pelo agent.",
        keyFacts: { npcs: [{ name: "Anselmo", status: "alive" }] },
        modelUsed: "claude-haiku-4-5-20251001",
        latencyMs: 700,
        tokensConsumed: 1234,
      },
    });

    const result = await service.ensureRecap(SESSION_ID);
    expect(result.status).toBe("generated");
    if (result.status === "generated") {
      expect(result.summaryText).toBe("Resumo gerado pelo agent.");
      expect(result.tokensConsumed).toBe(1234);
    }
    expect(outbound.request).toHaveBeenCalledTimes(1);
    expect(sessionRepo.update).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        summaryText: "Resumo gerado pelo agent.",
        summaryKeyFacts: expect.objectContaining({
          npcs: [{ name: "Anselmo", status: "alive" }],
        }),
      }),
    );
  });

  it("retorna failed { willRetry: true } quando agents responde 502", async () => {
    const { service, sessionRepo } = buildService({
      session: { id: SESSION_ID, campaignId: "c-1", summaryText: undefined },
      messageCount: 12,
      messages: Array.from({ length: 12 }).map((_, i) => ({
        sessionId: SESSION_ID,
        kind: "narration" as any,
        content: `m${i}`,
        sequenceNumber: i + 1,
      })),
      outboundRejects: new UpstreamException(
        ErrorCode.AGENT_UPSTREAM_ERROR,
        "upstream 502",
        { upstream: { service: "diad-agents", status: 502 } },
      ),
    });

    const result = await service.ensureRecap(SESSION_ID);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.willRetry).toBe(true);
      expect(result.errorCode).toBe(ErrorCode.AGENT_UPSTREAM_ERROR);
    }
    expect(sessionRepo.update).not.toHaveBeenCalled();
  });

  it("retorna failed { willRetry: false } quando auth falha (401)", async () => {
    const authException = new UpstreamException(
      ErrorCode.SUMMARIZE_AUTH_FAILED,
      "X-Internal-Token inválido",
      { upstream: { service: "diad-agents", status: 401 } },
    );
    const { service } = buildService({
      session: { id: SESSION_ID, campaignId: "c-1", summaryText: undefined },
      messageCount: 12,
      messages: Array.from({ length: 12 }).map((_, i) => ({
        sessionId: SESSION_ID,
        kind: "narration" as any,
        content: `m${i}`,
        sequenceNumber: i + 1,
      })),
      outboundRejects: authException,
    });

    const result = await service.ensureRecap(SESSION_ID);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.willRetry).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.SUMMARIZE_AUTH_FAILED);
    }
  });

  it("retorna failed quando agents retorna summaryText vazio", async () => {
    const { service, sessionRepo } = buildService({
      session: { id: SESSION_ID, campaignId: "c-1", summaryText: undefined },
      messageCount: 12,
      messages: Array.from({ length: 12 }).map((_, i) => ({
        sessionId: SESSION_ID,
        kind: "narration" as any,
        content: `m${i}`,
        sequenceNumber: i + 1,
      })),
      outboundResolves: { summaryText: "" },
    });
    const result = await service.ensureRecap(SESSION_ID);
    expect(result.status).toBe("failed");
    expect(sessionRepo.update).not.toHaveBeenCalled();
  });

  it("retorna failed { willRetry: false } com SUMMARIZE_INVALID_INPUT quando sessionId vazio", async () => {
    const { service } = buildService({});
    const result = await service.ensureRecap("");
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.willRetry).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.SUMMARIZE_INVALID_INPUT);
    }
  });
});
