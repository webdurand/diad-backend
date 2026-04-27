import {
  generateTraceId,
  generateSpanId,
  generateTraceparent,
  parseTraceparent,
} from "../trace/trace-context";

describe("trace-context", () => {
  describe("generateTraceId", () => {
    it("gera 32 lowercase hex chars", () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("gera valores distintos em chamadas consecutivas", () => {
      const a = generateTraceId();
      const b = generateTraceId();
      expect(a).not.toBe(b);
    });

    it("nunca retorna all-zeros", () => {
      for (let i = 0; i < 50; i++) {
        expect(generateTraceId()).not.toBe("0".repeat(32));
      }
    });
  });

  describe("generateSpanId", () => {
    it("gera 16 lowercase hex chars", () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it("nunca retorna all-zeros", () => {
      for (let i = 0; i < 50; i++) {
        expect(generateSpanId()).not.toBe("0".repeat(16));
      }
    });
  });

  describe("generateTraceparent", () => {
    it("formata 00-{traceId}-{spanId}-01", () => {
      const tp = generateTraceparent();
      expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it("aceita traceId e spanId customizados", () => {
      const t = "a".repeat(32);
      const s = "b".repeat(16);
      expect(generateTraceparent(t, s)).toBe(`00-${t}-${s}-01`);
    });
  });

  describe("parseTraceparent", () => {
    it("parseia header válido", () => {
      const tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      const parsed = parseTraceparent(tp);
      expect(parsed).toEqual({
        version: "00",
        traceId: "0af7651916cd43dd8448eb211c80319c",
        parentSpanId: "b7ad6b7169203331",
        flags: "01",
      });
    });

    it("retorna null para undefined/null/string vazia", () => {
      expect(parseTraceparent(undefined)).toBeNull();
      expect(parseTraceparent(null)).toBeNull();
      expect(parseTraceparent("")).toBeNull();
    });

    it("retorna null para formato inválido", () => {
      expect(parseTraceparent("garbage")).toBeNull();
      expect(parseTraceparent("00-tooshort-x-01")).toBeNull();
      expect(
        parseTraceparent("01-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01"),
      ).toBeNull();
    });

    it("retorna null para all-zeros traceId", () => {
      const bad = `00-${"0".repeat(32)}-${"b".repeat(16)}-01`;
      expect(parseTraceparent(bad)).toBeNull();
    });

    it("retorna null para all-zeros parentSpanId", () => {
      const bad = `00-${"a".repeat(32)}-${"0".repeat(16)}-01`;
      expect(parseTraceparent(bad)).toBeNull();
    });

    it("é idempotente — parse(generate(parse(x))) === parse(x)", () => {
      const orig = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      const p1 = parseTraceparent(orig)!;
      const regen = generateTraceparent(p1.traceId, p1.parentSpanId);
      const p2 = parseTraceparent(regen)!;
      expect(p2.traceId).toBe(p1.traceId);
      expect(p2.parentSpanId).toBe(p1.parentSpanId);
    });
  });
});
