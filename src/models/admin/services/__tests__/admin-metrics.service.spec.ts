import { DataSource } from "typeorm";
import { AdminMetricsService } from "../admin-metrics.service";
import { ValidationException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

function makeDs(
  handler: (sql: string, params: unknown[]) => unknown,
): DataSource {
  return {
    query: jest.fn(handler),
  } as unknown as DataSource;
}

describe("AdminMetricsService — resolvePeriod", () => {
  let service: AdminMetricsService;

  beforeEach(() => {
    service = new AdminMetricsService(makeDs(() => []));
  });

  it("usa preset 30d como default", () => {
    const p = service.resolvePeriod({});
    expect(p.days).toBe(30);
    expect(p.to.getTime()).toBeGreaterThan(p.from.getTime());
  });

  it("aplica preset 7d", () => {
    const p = service.resolvePeriod({ period: "7d" });
    expect(p.days).toBe(7);
  });

  it("aplica preset 90d", () => {
    const p = service.resolvePeriod({ period: "90d" });
    expect(p.days).toBe(90);
  });

  it("respeita from/to ISO custom", () => {
    const p = service.resolvePeriod({
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-15T00:00:00Z",
    });
    expect(p.days).toBe(14);
  });

  it("rejeita from inválido", () => {
    expect(() =>
      service.resolvePeriod({ from: "not-a-date", to: "2026-04-15T00:00:00Z" }),
    ).toThrow(ValidationException);
  });

  it("rejeita from > to", () => {
    expect(() =>
      service.resolvePeriod({
        from: "2026-04-15T00:00:00Z",
        to: "2026-04-01T00:00:00Z",
      }),
    ).toThrow(ValidationException);
  });

  it("rejeita intervalo > 365 dias", () => {
    expect(() =>
      service.resolvePeriod({
        from: "2024-01-01T00:00:00Z",
        to: "2026-01-01T00:00:00Z",
      }),
    ).toThrow(ValidationException);
  });
});

describe("AdminMetricsService — getOverview", () => {
  it("agrega totals + previous + cpau corretamente", async () => {
    const ds = makeDs((sql) => {
      if (sql.includes("FROM mv_admin_costs_daily")) {
        return [
          {
            total_cost_usd: "5.50",
            total_calls: "100",
            input_tokens: "10000",
            output_tokens: "5000",
            cache_creation_tokens: "200",
            cache_read_tokens: "1800",
          },
        ];
      }
      if (sql.includes("FROM mv_admin_usage_daily")) {
        return [
          {
            active_users: 10,
            active_sessions: 25,
            active_campaigns: 5,
          },
        ];
      }
      return [];
    });
    const service = new AdminMetricsService(ds);
    const out = await service.getOverview({ period: "30d" });

    expect(out.totals.totalCostUsd).toBe(5.5);
    expect(out.totals.totalCalls).toBe(100);
    expect(out.totals.cacheHitRate).toBeGreaterThan(0);
    expect(out.activeUsers).toBe(10);
    expect(out.activeSessions).toBe(25);
    expect(out.cpau).toBe(0.55);
    expect(out.costPerSession).toBe(0.22);
    expect(out.marginHeadroom.cpauCeilingUsd).toBe(4);
    expect(out.marginHeadroom.cpauActualUsd).toBe(0.55);
  });

  it("retorna zeros sem dados", async () => {
    const ds = makeDs(() => [{}]);
    const service = new AdminMetricsService(ds);
    const out = await service.getOverview({ period: "7d" });

    expect(out.totals.totalCostUsd).toBe(0);
    expect(out.cpau).toBe(0);
    expect(out.costPerSession).toBe(0);
    expect(out.marginHeadroom.headroomPct).toBe(1);
  });
});

describe("AdminMetricsService — getCosts", () => {
  it("retorna breakdowns por modelo, agente, feature + top spenders + sparkline", async () => {
    const ds = makeDs((sql) => {
      if (sql.includes("GROUP BY 1") && sql.includes("model_id::text")) {
        return [
          {
            key: "claude-haiku-4-5",
            cost_usd: "1.20",
            calls: "50",
            input_tokens: "1000",
            output_tokens: "500",
            cache_read_tokens: "100",
            cache_creation_tokens: "50",
          },
        ];
      }
      if (sql.includes("agent_role::text")) {
        return [
          {
            key: "narrator",
            cost_usd: "0.80",
            calls: "30",
            input_tokens: "600",
            output_tokens: "300",
            cache_read_tokens: "60",
            cache_creation_tokens: "30",
          },
        ];
      }
      if (sql.includes("feature_name::text")) {
        return [];
      }
      if (sql.includes("LEFT JOIN users u ON u.id = m.dm_user_id")) {
        return [
          {
            user_id: "uuid-1",
            email: "alice@diad.local",
            name: "Alice",
            cost_usd: "1.00",
            calls: "40",
            input_tokens: "800",
            output_tokens: "400",
            cache_read_tokens: "80",
            cache_creation_tokens: "40",
          },
        ];
      }
      if (sql.includes("SUM(cost_usd)::numeric AS total")) {
        return [{ total: "1.00" }];
      }
      if (sql.includes("to_char(day, 'YYYY-MM-DD')")) {
        return [
          { day: "2026-04-30", cost_usd: "0.50", calls: "20" },
          { day: "2026-05-01", cost_usd: "0.70", calls: "30" },
        ];
      }
      return [{}];
    });

    const service = new AdminMetricsService(ds);
    const out = await service.getCosts({ period: "7d" });
    expect(out.byModel).toHaveLength(1);
    expect(out.byModel[0].key).toBe("claude-haiku-4-5");
    expect(out.byAgent[0].key).toBe("narrator");
    expect(out.topSpenders).toHaveLength(1);
    expect(out.topSpenders[0].email).toBe("alice@diad.local");
    expect(out.sparkline).toHaveLength(2);
  });
});

describe("AdminMetricsService — cursor pagination", () => {
  it("encode/decode cursor roundtrip", () => {
    const service = new AdminMetricsService(makeDs(() => []));
    const cursor = (service as any).encodeCursor(
      "2026-05-01T00:00:00Z",
      "uuid-x",
    );
    const decoded = (service as any).parseCursor(cursor);
    expect(decoded).toEqual({
      createdAt: "2026-05-01T00:00:00Z",
      id: "uuid-x",
    });
  });

  it("rejeita cursor malformado", () => {
    const service = new AdminMetricsService(makeDs(() => []));
    expect(() => (service as any).parseCursor("not-base64-format")).toThrow(
      ValidationException,
    );
  });

  it("aceita undefined", () => {
    const service = new AdminMetricsService(makeDs(() => []));
    expect((service as any).parseCursor(undefined)).toBeNull();
  });
});

describe("AdminMetricsService — exportLogsCsv", () => {
  it("gera CSV com header + linhas escapadas", async () => {
    const ds = makeDs((sql) => {
      if (sql.includes("FROM ai_usage_logs")) {
        return [
          {
            id: "id-1",
            created_at: "2026-05-01T10:00:00Z",
            session_id: "s-1",
            user_id: "u-1",
            email: "test@diad.local",
            agent_role: "narrator",
            model_id: "claude-haiku-4-5",
            feature_name: "narrative_turn",
            cost_usd: "0.001",
            input_tokens: "100",
            output_tokens: "50",
            cache_read_tokens: "10",
            cache_creation_tokens: "0",
            took_ms: 800,
            scene_type: null,
            turn_number: null,
            character_id: null,
          },
        ];
      }
      return [];
    });
    const service = new AdminMetricsService(ds);
    const csv = await service.exportLogsCsv({
      period: "24h",
      source: "ai_usage",
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("source,id,createdAt");
    expect(lines[1]).toContain("ai_usage");
    expect(lines[1]).toContain("test@diad.local");
  });

  it("rejeita quando passa do limite com source única", async () => {
    const ds = makeDs(() =>
      Array.from({ length: 10_001 }, (_, i) => ({
        id: `id-${i}`,
        created_at: "2026-05-01T10:00:00Z",
        action: "x",
        admin_id: "u",
        details: {},
      })),
    );
    const service = new AdminMetricsService(ds);
    await expect(
      service.exportLogsCsv({ period: "30d", source: "admin_audit" }),
    ).rejects.toThrow(ValidationException);
  });
});
