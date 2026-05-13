import {
  buildPinoOptions,
  __serializeErrorForTest,
} from "../logger/pino.config";

interface TestPinoHttpOptions {
  redact?: { paths: string[]; censor: string };
  base?: Record<string, string>;
  formatters?: { level?: (label: string, number: number) => object };
  transport?: unknown;
  level?: string;
}

function pinoHttpOptions(): TestPinoHttpOptions {
  return buildPinoOptions({ env: "test" }).pinoHttp as TestPinoHttpOptions;
}

describe("pino.config", () => {
  describe("buildPinoOptions", () => {
    it("aplica redact paths sensíveis", () => {
      const opts = pinoHttpOptions();
      const redact = opts.redact;
      expect(redact).toBeDefined();
      const paths = (redact as { paths: string[] }).paths;
      expect(paths).toEqual(
        expect.arrayContaining([
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.apiKey",
          "*.token",
        ]),
      );
      expect((redact as { censor: string }).censor).toBe("[REDACTED]");
    });

    it("inclui base com service.name=diad-backend", () => {
      const opts = buildPinoOptions({ env: "test", serviceVersion: "1.2.3" });
      const base = (opts.pinoHttp as TestPinoHttpOptions).base ?? {};
      expect(base["service.name"]).toBe("diad-backend");
      expect(base["service.version"]).toBe("1.2.3");
      expect(base["deployment.environment"]).toBe("test");
    });

    it("formata level como string (não número)", () => {
      const opts = pinoHttpOptions();
      const formatter = opts.formatters?.level;
      expect(formatter).toBeDefined();
      expect(formatter!("info", 30)).toEqual({ level: "info" });
    });

    it("usa pino-pretty transport apenas em development", () => {
      const dev = buildPinoOptions({ env: "development" });
      expect((dev.pinoHttp as TestPinoHttpOptions).transport).toBeDefined();

      const prod = buildPinoOptions({ env: "production" });
      expect((prod.pinoHttp as TestPinoHttpOptions).transport).toBeUndefined();
    });

    it("respeita LOG_LEVEL via args", () => {
      const opts = buildPinoOptions({ env: "test", level: "debug" });
      expect((opts.pinoHttp as TestPinoHttpOptions).level).toBe("debug");
    });
  });

  describe("serializeError (cause chain)", () => {
    it("serializa Error simples", () => {
      const err = new Error("boom");
      const out = __serializeErrorForTest(err) as Record<string, unknown>;
      expect(out.type).toBe("Error");
      expect(out.message).toBe("boom");
      expect(typeof out.stack).toBe("string");
    });

    it("expande cause até 3+ níveis", () => {
      const root = new Error("root");
      const mid = new Error("mid", { cause: root });
      const top = new Error("top", { cause: mid });
      const out = __serializeErrorForTest(top) as Record<string, unknown>;
      expect(out.message).toBe("top");
      const lvl1 = out.cause as Record<string, unknown>;
      expect(lvl1.message).toBe("mid");
      const lvl2 = lvl1.cause as Record<string, unknown>;
      expect(lvl2.message).toBe("root");
    });

    it("respeita maxDepth (não loop infinito)", () => {
      const e = new Error("e") as Error & { cause?: Error };
      e.cause = e;

      const out = __serializeErrorForTest(e);
      expect(out).toBeDefined();
    });

    it("aceita erros não-Error como objeto plain", () => {
      const out = __serializeErrorForTest({ message: "hi" });
      expect(out).toEqual({ message: "hi" });
    });
  });
});
