import { ClsService } from "nestjs-cls";
import { DiadLogger } from "../logger/diad-logger.service";

interface FakePino {
  setContext: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

function makePino(): FakePino {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function makeCls(values: Record<string, string>): ClsService {
  return {
    isActive: () => true,
    get: (key: string) => values[key],
  } as unknown as ClsService;
}

describe("DiadLogger", () => {
  it("info injeta trace.id e span.id do CLS", () => {
    const pino = makePino();
    const cls = makeCls({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
    });
    const logger = new DiadLogger(pino as any, cls);
    logger.info("campaign.created", { campaignId: "c1" });

    expect(pino.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = pino.info.mock.calls[0];
    expect(msg).toBe("campaign.created");
    expect(payload).toMatchObject({
      event: "campaign.created",
      "trace.id": "a".repeat(32),
      "span.id": "b".repeat(16),
      campaignId: "c1",
    });
  });

  it("warn/debug seguem mesmo padrão", () => {
    const pino = makePino();
    const cls = makeCls({ traceId: "x".repeat(32) });
    const logger = new DiadLogger(pino as any, cls);
    logger.warn("http.client.request", { "url.path": "/x" });
    logger.debug("foo.bar", { k: 1 });
    expect(pino.warn).toHaveBeenCalled();
    expect(pino.debug).toHaveBeenCalled();
  });

  it("error inclui err object como `err` (pino serializer expande)", () => {
    const pino = makePino();
    const cls = makeCls({ traceId: "a".repeat(32) });
    const logger = new DiadLogger(pino as any, cls);
    const cause = new Error("inner");
    const err = new Error("outer", { cause });
    logger.error("http.client.request", err, { "url.path": "/y" });
    const [payload] = pino.error.mock.calls[0];
    expect(payload.err).toBe(err);
    expect(payload.event).toBe("http.client.request");
    expect(payload["trace.id"]).toBe("a".repeat(32));
  });

  it("funciona sem CLS (omite trace.id)", () => {
    const pino = makePino();
    const logger = new DiadLogger(pino as any);
    logger.info("event", { x: 1 });
    const [payload] = pino.info.mock.calls[0];
    expect(payload).not.toHaveProperty("trace.id");
    expect(payload.x).toBe(1);
  });

  it("setContext repassa pro pino", () => {
    const pino = makePino();
    const logger = new DiadLogger(pino as any);
    logger.setContext("AiProxyService");
    expect(pino.setContext).toHaveBeenCalledWith("AiProxyService");
  });
});
