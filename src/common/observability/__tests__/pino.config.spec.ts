import {
  buildPinoOptions,
  __serializeErrorForTest,
} from "../logger/pino.config";

describe("pino.config", () => {
  describe("buildPinoOptions", () => {
    it("aplica redact paths sensíveis", () => {
      const opts = buildPinoOptions({ env: "test" });
      const redact = opts.pinoHttp?.redact;
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
      const base = opts.pinoHttp?.base as Record<string, string>;
      expect(base["service.name"]).toBe("diad-backend");
      expect(base["service.version"]).toBe("1.2.3");
      expect(base["deployment.environment"]).toBe("test");
    });

    it("formata level como string (não número)", () => {
      const opts = buildPinoOptions({ env: "test" });
      const formatter = opts.pinoHttp?.formatters?.level;
      expect(formatter).toBeDefined();
      expect(formatter!("info", 30)).toEqual({ level: "info" });
    });

    it("usa pino-pretty transport apenas em development", () => {
      const dev = buildPinoOptions({ env: "development" });
      expect(dev.pinoHttp?.transport).toBeDefined();

      const prod = buildPinoOptions({ env: "production" });
      expect(prod.pinoHttp?.transport).toBeUndefined();
    });

    it("respeita LOG_LEVEL via args", () => {
      const opts = buildPinoOptions({ env: "test", level: "debug" });
      expect(opts.pinoHttp?.level).toBe("debug");
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
      const e: Error & { cause?: Error } = new Error("e");
      e.cause = e; // self-reference
      // Não deve estourar stack
      const out = __serializeErrorForTest(e);
      expect(out).toBeDefined();
    });

    it("aceita erros não-Error como objeto plain", () => {
      const out = __serializeErrorForTest({ message: "hi" });
      expect(out).toEqual({ message: "hi" });
    });
  });
});
