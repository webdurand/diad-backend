import { ClsService } from "nestjs-cls";
import { OutboundFetch } from "../http/outbound-fetch.service";
import { UpstreamException } from "../errors/diad-exception";
import { DiadLogger } from "../logger/diad-logger.service";
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

interface MockFetchOpts {
  status?: number;
  body?: unknown;
  contentType?: string;
  throwError?: Error;
}

function mockFetch(opts: MockFetchOpts): jest.Mock {
  const fn = jest.fn().mockImplementation(() => {
    if (opts.throwError) return Promise.reject(opts.throwError);
    const status = opts.status ?? 200;
    const headers = new Headers({
      "content-type": opts.contentType ?? "application/json",
    });
    const responseBody =
      typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body ?? {});
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers,
      json: () => Promise.resolve(opts.body),
      text: () => Promise.resolve(responseBody),
    } as unknown as Response);
  });
  return fn;
}

describe("OutboundFetch", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("injeta traceparent no header outbound (mesmo trace-id, novo span-id)", async () => {
    const traceId = "a".repeat(32);
    global.fetch = mockFetch({ status: 200, body: { ok: true } }) as any;
    const fetcher = new OutboundFetch(makeCls({ traceId }), makeLogger());
    await fetcher.request<unknown>("http://upstream/x", {
      upstreamService: "diad-agents",
      method: "POST",
      body: "{}",
    });
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers.traceparent).toMatch(
      new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`),
    );
  });

  it("200 OK retorna body parseado", async () => {
    global.fetch = mockFetch({ status: 200, body: { foo: "bar" } }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    const out = await fetcher.request<{ foo: string }>("http://x", {
      upstreamService: "diad-agents",
    });
    expect(out).toEqual({ foo: "bar" });
  });

  it("5xx upstream → UpstreamException com status e body preservados", async () => {
    global.fetch = mockFetch({
      status: 500,
      body: { error: "Falha ao criar campanha — session_id nao encontrado" },
    }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    await expect(
      fetcher.request("http://upstream/solo/create", {
        upstreamService: "diad-agents",
        method: "POST",
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_UPSTREAM_ERROR,
      upstream: {
        service: "diad-agents",
        status: 500,
        body: { error: "Falha ao criar campanha — session_id nao encontrado" },
      },
    });
  });

  it("upstream problem+json com detail → propaga detail", async () => {
    global.fetch = mockFetch({
      status: 502,
      contentType: "application/problem+json",
      body: {
        detail: "agent died",
        code: "AGENT_X",
        traceId: "b".repeat(32),
      },
    }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    await expect(
      fetcher.request("http://x", { upstreamService: "diad-agents" }),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_UPSTREAM_ERROR,
      message: "agent died",
    });
  });

  it("200 com {error: x} sem data → AGENT_INVALID_RESPONSE", async () => {
    global.fetch = mockFetch({
      status: 200,
      body: { error: "session_id missing" },
    }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    await expect(
      fetcher.request("http://x", { upstreamService: "diad-agents" }),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_INVALID_RESPONSE,
    });
  });

  it("200 com {error: null, data: {}} NÃO dispara AGENT_INVALID_RESPONSE", async () => {
    global.fetch = mockFetch({
      status: 200,
      body: { error: null, data: { ok: true } },
    }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    const r = await fetcher.request<{ data: unknown }>("http://x", {
      upstreamService: "diad-agents",
    });
    expect(r.data).toEqual({ ok: true });
  });

  it("AbortError → AGENT_TIMEOUT", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    global.fetch = mockFetch({ throwError: abort }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    await expect(
      fetcher.request("http://x", { upstreamService: "diad-agents" }),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_TIMEOUT });
  });

  it("TypeError network → AGENT_UNREACHABLE", async () => {
    const networkErr = new TypeError("fetch failed");
    global.fetch = mockFetch({ throwError: networkErr }) as any;
    const fetcher = new OutboundFetch(makeCls(), makeLogger());
    await expect(
      fetcher.request("http://x", { upstreamService: "diad-agents" }),
    ).rejects.toBeInstanceOf(UpstreamException);
    try {
      await fetcher.request("http://x", { upstreamService: "diad-agents" });
    } catch (err) {
      expect((err as UpstreamException).code).toBe(ErrorCode.AGENT_UNREACHABLE);
    }
  });

  it("logger.warn é chamado em erros e logger.info em sucesso", async () => {
    const logger = makeLogger();
    global.fetch = mockFetch({ status: 200, body: {} }) as any;
    const fetcher = new OutboundFetch(makeCls(), logger);
    await fetcher.request("http://x", { upstreamService: "diad-agents" });
    expect(logger.info).toHaveBeenCalled();
    expect((logger.info as jest.Mock).mock.calls[0][0]).toBe(
      "http.client.request",
    );
  });
});
