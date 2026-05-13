import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ValidationException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import {
  CostsQueryDto,
  LogsQueryDto,
  PeriodPreset,
  PeriodQueryDto,
  UsageQueryDto,
} from "../dto/admin-metrics.dto";

const DAY_MS = 86_400_000;
const PRESET_DAYS: Record<PeriodPreset, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
};
const DEFAULT_PRESET: PeriodPreset = "30d";

const EXPORT_ROW_LIMIT = 10_000;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

interface ResolvedPeriod {
  from: Date;
  to: Date;
  days: number;
}

interface CostsTotals {
  totalCostUsd: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cacheHitRate: number;
}

interface CostBreakdownRow {
  key: string;
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface TopSpenderRow extends CostBreakdownRow {
  userId: string;
  email: string | null;
  name: string | null;
}

interface DailySparklinePoint {
  day: string;
  costUsd: number;
  calls: number;
}

export interface OverviewResponse {
  period: { from: string; to: string; days: number };
  totals: CostsTotals;
  totalsPrevious: CostsTotals;
  cpau: number;
  cpauPrevious: number;
  costPerSession: number;
  costPerSessionPrevious: number;
  activeUsers: number;
  activeSessions: number;
  activeCampaigns: number;
  marginHeadroom: {
    cpauCeilingUsd: number;
    cpauActualUsd: number;
    headroomPct: number;
  };
}

export interface CostsResponse {
  period: { from: string; to: string; days: number };
  filters: {
    model?: string;
    agentRole?: string;
    featureName?: string;
    userId?: string;
  };
  totals: CostsTotals;
  totalsPrevious: CostsTotals;
  byModel: CostBreakdownRow[];
  byAgent: CostBreakdownRow[];
  byFeature: CostBreakdownRow[];
  topSpenders: TopSpenderRow[];
  topSpendersConcentrationAlert: boolean;
  sparkline: DailySparklinePoint[];
}

interface CohortMatrixRow {
  cohortWeek: string;
  cohortSize: number;
  cells: Array<{
    activeWeek: string;
    weeksSinceCohort: number;
    usersActive: number;
    retentionRate: number;
  }>;
}

interface FeatureCountRow {
  eventCategory: string;
  eventType: string;
  totalCount: number;
  sessionsCount: number;
}

export interface UsageResponse {
  period: { from: string; to: string; days: number };
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  nsm: number;
  activationRate24h: number;
  healthySessionRate: number;
  cohort: {
    start: "M0" | "M3";
    rows: CohortMatrixRow[];
  };
  topFeatures: FeatureCountRow[];
  dailyActiveUsers: Array<{ day: string; activeUsers: number }>;
}

interface LogRow {
  source: "session_event" | "ai_usage" | "admin_audit";
  id: string;
  createdAt: string;
  summary: string;
  category?: string | null;
  eventType?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  email?: string | null;
  agentRole?: string | null;
  modelId?: string | null;
  featureName?: string | null;
  costUsd?: number | null;
  traceId?: string | null;
  payload: Record<string, unknown>;
}

export interface LogsResponse {
  rows: LogRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class AdminMetricsService {
  private readonly logger = new Logger(AdminMetricsService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}



  resolvePeriod(query: PeriodQueryDto): ResolvedPeriod {
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : null;
      const to = query.to ? new Date(query.to) : new Date();
      if (!from || Number.isNaN(from.getTime())) {
        throw new ValidationException(
          ErrorCode.ADMIN_METRICS_PERIOD_INVALID,
          "from inválido",
        );
      }
      if (Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
        throw new ValidationException(
          ErrorCode.ADMIN_METRICS_PERIOD_INVALID,
          "Intervalo from/to inválido",
        );
      }
      const days = Math.max(
        1,
        Math.round((to.getTime() - from.getTime()) / DAY_MS),
      );
      if (days > 365) {
        throw new ValidationException(
          ErrorCode.ADMIN_METRICS_PERIOD_INVALID,
          "Intervalo máximo é 365 dias",
        );
      }
      return { from, to, days };
    }
    const preset = query.period ?? DEFAULT_PRESET;
    const days = PRESET_DAYS[preset];
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    return { from, to, days };
  }

  private previousPeriod(p: ResolvedPeriod): ResolvedPeriod {
    const to = new Date(p.from.getTime());
    const from = new Date(p.from.getTime() - p.days * DAY_MS);
    return { from, to, days: p.days };
  }

  private parseCosts(row: Record<string, unknown> | undefined): CostsTotals {
    const inputTokens = Number(row?.input_tokens ?? 0);
    const outputTokens = Number(row?.output_tokens ?? 0);
    const cacheCreationTokens = Number(row?.cache_creation_tokens ?? 0);
    const cacheReadTokens = Number(row?.cache_read_tokens ?? 0);
    const totalCostUsd = Number(row?.total_cost_usd ?? row?.cost_usd ?? 0);
    const totalCalls = Number(row?.total_calls ?? row?.calls ?? 0);
    const cacheableTotal = cacheReadTokens + cacheCreationTokens + inputTokens;
    const cacheHitRate =
      cacheableTotal > 0 ? cacheReadTokens / cacheableTotal : 0;
    return {
      totalCostUsd: round6(totalCostUsd),
      totalCalls,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      cacheHitRate: Number(cacheHitRate.toFixed(4)),
    };
  }



  private buildSqlBindings(filters: CostsQueryDto, period: ResolvedPeriod) {
    const params: unknown[] = [period.from, period.to];
    const wheres: string[] = ["day >= $1", "day <= $2"];
    if (filters.model) {
      params.push(filters.model);
      wheres.push(`model_id = $${params.length}`);
    }
    if (filters.agentRole) {
      params.push(filters.agentRole);
      wheres.push(`agent_role = $${params.length}`);
    }
    if (filters.featureName) {
      params.push(filters.featureName);
      wheres.push(`feature_name = $${params.length}`);
    }
    if (filters.userId) {
      params.push(filters.userId);
      wheres.push(`dm_user_id = $${params.length}`);
    }
    return { where: wheres.join(" AND "), params };
  }

  private async totalsViaMatview(
    period: ResolvedPeriod,
    filters: CostsQueryDto = {},
  ): Promise<CostsTotals> {
    const { where, params } = this.buildSqlBindings(filters, period);
    const rows = await this.ds.query(
      `SELECT
         COALESCE(SUM(cost_usd), 0)::numeric AS total_cost_usd,
         COALESCE(SUM(calls), 0)::bigint AS total_calls,
         COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
         COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
         COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
         COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens
       FROM mv_admin_costs_daily
       WHERE ${where}`,
      params,
    );
    return this.parseCosts(rows[0]);
  }

  private async breakdownByDimension(
    period: ResolvedPeriod,
    filters: CostsQueryDto,
    dimension: "model_id" | "agent_role" | "feature_name",
  ): Promise<CostBreakdownRow[]> {
    const { where, params } = this.buildSqlBindings(filters, period);
    const rows = await this.ds.query(
      `SELECT
         COALESCE(${dimension}::text, 'unknown') AS key,
         SUM(cost_usd)::numeric AS cost_usd,
         SUM(calls)::bigint AS calls,
         SUM(input_tokens)::bigint AS input_tokens,
         SUM(output_tokens)::bigint AS output_tokens,
         SUM(cache_read_tokens)::bigint AS cache_read_tokens,
         SUM(cache_creation_tokens)::bigint AS cache_creation_tokens
       FROM mv_admin_costs_daily
       WHERE ${where}
       GROUP BY 1
       ORDER BY cost_usd DESC NULLS LAST`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      key: String(r.key ?? "unknown"),
      costUsd: round6(Number(r.cost_usd ?? 0)),
      calls: Number(r.calls ?? 0),
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      cacheReadTokens: Number(r.cache_read_tokens ?? 0),
      cacheCreationTokens: Number(r.cache_creation_tokens ?? 0),
    }));
  }

  private async topSpenders(
    period: ResolvedPeriod,
    filters: CostsQueryDto,
    limit = 20,
  ): Promise<{ rows: TopSpenderRow[]; concentrationAlert: boolean }> {
    const { where, params } = this.buildSqlBindings(filters, period);
    params.push(limit);
    const rows = await this.ds.query(
      `SELECT
         m.dm_user_id::text AS user_id,
         u.email AS email,
         u.name AS name,
         SUM(m.cost_usd)::numeric AS cost_usd,
         SUM(m.calls)::bigint AS calls,
         SUM(m.input_tokens)::bigint AS input_tokens,
         SUM(m.output_tokens)::bigint AS output_tokens,
         SUM(m.cache_read_tokens)::bigint AS cache_read_tokens,
         SUM(m.cache_creation_tokens)::bigint AS cache_creation_tokens
       FROM mv_admin_costs_daily m
       LEFT JOIN users u ON u.id = m.dm_user_id
       WHERE ${where} AND m.dm_user_id IS NOT NULL
       GROUP BY m.dm_user_id, u.email, u.name
       ORDER BY cost_usd DESC NULLS LAST
       LIMIT $${params.length}`,
      params,
    );

    const all = await this.ds.query(
      `SELECT SUM(cost_usd)::numeric AS total
       FROM mv_admin_costs_daily WHERE ${where} AND dm_user_id IS NOT NULL`,
      params.slice(0, params.length - 1),
    );
    const totalCost = Number(all[0]?.total ?? 0);
    const top1Pct = Math.max(1, Math.ceil(rows.length * 0.01));
    const top1Sum = rows
      .slice(0, top1Pct)
      .reduce(
        (acc: number, r: Record<string, unknown>) =>
          acc + Number(r.cost_usd ?? 0),
        0,
      );
    const concentrationAlert = totalCost > 0 && top1Sum / totalCost > 0.3;

    return {
      rows: rows.map((r: Record<string, unknown>) => ({
        userId: String(r.user_id),
        email: r.email ? String(r.email) : null,
        name: r.name ? String(r.name) : null,
        key: String(r.user_id),
        costUsd: round6(Number(r.cost_usd ?? 0)),
        calls: Number(r.calls ?? 0),
        inputTokens: Number(r.input_tokens ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
        cacheReadTokens: Number(r.cache_read_tokens ?? 0),
        cacheCreationTokens: Number(r.cache_creation_tokens ?? 0),
      })),
      concentrationAlert,
    };
  }

  private async sparkline(
    period: ResolvedPeriod,
    filters: CostsQueryDto,
  ): Promise<DailySparklinePoint[]> {
    const { where, params } = this.buildSqlBindings(filters, period);
    const rows = await this.ds.query(
      `SELECT
         to_char(day, 'YYYY-MM-DD') AS day,
         SUM(cost_usd)::numeric AS cost_usd,
         SUM(calls)::bigint AS calls
       FROM mv_admin_costs_daily
       WHERE ${where}
       GROUP BY day
       ORDER BY day ASC`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      day: String(r.day),
      costUsd: round6(Number(r.cost_usd ?? 0)),
      calls: Number(r.calls ?? 0),
    }));
  }

  async getCosts(query: CostsQueryDto): Promise<CostsResponse> {
    const period = this.resolvePeriod(query);
    const previous = this.previousPeriod(period);
    const [
      totals,
      totalsPrevious,
      byModel,
      byAgent,
      byFeature,
      topSpenders,
      sparkline,
    ] = await Promise.all([
      this.totalsViaMatview(period, query),
      this.totalsViaMatview(previous, query),
      this.breakdownByDimension(period, query, "model_id"),
      this.breakdownByDimension(period, query, "agent_role"),
      this.breakdownByDimension(period, query, "feature_name"),
      this.topSpenders(period, query, 20),
      this.sparkline(period, query),
    ]);

    return {
      period: this.formatPeriod(period),
      filters: {
        model: query.model,
        agentRole: query.agentRole,
        featureName: query.featureName,
        userId: query.userId,
      },
      totals,
      totalsPrevious,
      byModel,
      byAgent,
      byFeature,
      topSpenders: topSpenders.rows,
      topSpendersConcentrationAlert: topSpenders.concentrationAlert,
      sparkline,
    };
  }



  async getOverview(query: PeriodQueryDto): Promise<OverviewResponse> {
    const period = this.resolvePeriod(query);
    const previous = this.previousPeriod(period);
    const [totals, totalsPrev, usage, usagePrev] = await Promise.all([
      this.totalsViaMatview(period, {}),
      this.totalsViaMatview(previous, {}),
      this.queryUsageAggregates(period),
      this.queryUsageAggregates(previous),
    ]);
    const cpauCeilingUsd = 4;
    const cpau =
      usage.activeUsers > 0 ? totals.totalCostUsd / usage.activeUsers : 0;
    const cpauPrev =
      usagePrev.activeUsers > 0
        ? totalsPrev.totalCostUsd / usagePrev.activeUsers
        : 0;
    const costPerSession =
      usage.activeSessions > 0 ? totals.totalCostUsd / usage.activeSessions : 0;
    const costPerSessionPrev =
      usagePrev.activeSessions > 0
        ? totalsPrev.totalCostUsd / usagePrev.activeSessions
        : 0;

    return {
      period: this.formatPeriod(period),
      totals,
      totalsPrevious: totalsPrev,
      cpau: round6(cpau),
      cpauPrevious: round6(cpauPrev),
      costPerSession: round6(costPerSession),
      costPerSessionPrevious: round6(costPerSessionPrev),
      activeUsers: usage.activeUsers,
      activeSessions: usage.activeSessions,
      activeCampaigns: usage.activeCampaigns,
      marginHeadroom: {
        cpauCeilingUsd,
        cpauActualUsd: round6(cpau),
        headroomPct:
          cpau > 0
            ? Number(((cpauCeilingUsd - cpau) / cpauCeilingUsd).toFixed(4))
            : 1,
      },
    };
  }

  private async queryUsageAggregates(period: ResolvedPeriod): Promise<{
    activeUsers: number;
    activeSessions: number;
    activeCampaigns: number;
  }> {
    const rows = await this.ds.query(
      `SELECT
         COALESCE(MAX(active_users), 0)::int AS active_users,
         COALESCE(SUM(active_sessions), 0)::int AS active_sessions,
         COALESCE(MAX(active_campaigns), 0)::int AS active_campaigns
       FROM mv_admin_usage_daily
       WHERE day >= $1 AND day <= $2`,
      [period.from, period.to],
    );
    return {
      activeUsers: Number(rows[0]?.active_users ?? 0),
      activeSessions: Number(rows[0]?.active_sessions ?? 0),
      activeCampaigns: Number(rows[0]?.active_campaigns ?? 0),
    };
  }



  async getUsage(query: UsageQueryDto): Promise<UsageResponse> {
    const period = this.resolvePeriod(query);
    const cohortStart: "M0" | "M3" = query.cohortStart ?? "M0";

    const [daily, cohort, topFeatures, healthy, activation] = await Promise.all(
      [
        this.dailyActiveUsers(period),
        this.cohortMatrix(period, cohortStart),
        this.topFeatures(period),
        this.healthySessionRate(period),
        this.activationRate24h(period),
      ],
    );

    const today = new Date();
    const dau =
      daily.find((d) => d.day === today.toISOString().slice(0, 10))
        ?.activeUsers ?? 0;
    const wauWindow = daily.slice(-7);
    const wau = Math.max(...wauWindow.map((d) => d.activeUsers), 0);
    const mauWindow = daily.slice(-30);
    const mau = Math.max(...mauWindow.map((d) => d.activeUsers), 0);
    const stickiness = mau > 0 ? Number((dau / mau).toFixed(4)) : 0;

    const totalSessions = await this.totalSessionsInPeriod(period);
    const weeks = Math.max(1, Math.ceil(period.days / 7));
    const nsm = mau > 0 ? Number((totalSessions / mau / weeks).toFixed(4)) : 0;

    return {
      period: this.formatPeriod(period),
      dau,
      wau,
      mau,
      stickiness,
      nsm,
      activationRate24h: activation,
      healthySessionRate: healthy,
      cohort: { start: cohortStart, rows: cohort },
      topFeatures,
      dailyActiveUsers: daily,
    };
  }

  private async dailyActiveUsers(
    period: ResolvedPeriod,
  ): Promise<Array<{ day: string; activeUsers: number }>> {
    const rows = await this.ds.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, active_users::int AS active_users
       FROM mv_admin_usage_daily
       WHERE day >= $1 AND day <= $2
       ORDER BY day ASC`,
      [period.from, period.to],
    );
    return rows.map((r: Record<string, unknown>) => ({
      day: String(r.day),
      activeUsers: Number(r.active_users ?? 0),
    }));
  }

  private async cohortMatrix(
    period: ResolvedPeriod,
    start: "M0" | "M3",
  ): Promise<CohortMatrixRow[]> {
    const offsetWeeks = start === "M3" ? 12 : 0;
    const rows = await this.ds.query(
      `SELECT
         to_char(cohort_week, 'YYYY-MM-DD') AS cohort_week,
         to_char(active_week, 'YYYY-MM-DD') AS active_week,
         cohort_size::int AS cohort_size,
         users_active::int AS users_active,
         retention_rate::numeric AS retention_rate
       FROM mv_admin_cohort_weekly
       WHERE cohort_week >= $1 AND active_week <= $2
       ORDER BY cohort_week ASC, active_week ASC`,
      [period.from, period.to],
    );

    const grouped = new Map<string, CohortMatrixRow>();
    for (const r of rows as Array<Record<string, unknown>>) {
      const cw = String(r.cohort_week);
      const aw = String(r.active_week);
      const cohortDate = new Date(cw).getTime();
      const activeDate = new Date(aw).getTime();
      const weeksSince = Math.floor((activeDate - cohortDate) / (7 * DAY_MS));
      if (weeksSince < offsetWeeks) continue;

      if (!grouped.has(cw)) {
        grouped.set(cw, {
          cohortWeek: cw,
          cohortSize: Number(r.cohort_size ?? 0),
          cells: [],
        });
      }
      grouped.get(cw)!.cells.push({
        activeWeek: aw,
        weeksSinceCohort: weeksSince,
        usersActive: Number(r.users_active ?? 0),
        retentionRate: Number(r.retention_rate ?? 0),
      });
    }
    return Array.from(grouped.values());
  }

  private async topFeatures(
    period: ResolvedPeriod,
    limit = 20,
  ): Promise<FeatureCountRow[]> {
    const rows = await this.ds.query(
      `SELECT
         event_category,
         event_type,
         SUM(event_count)::bigint AS total_count,
         SUM(sessions_count)::bigint AS sessions_count
       FROM mv_admin_features_daily
       WHERE day >= $1 AND day <= $2
       GROUP BY 1, 2
       ORDER BY total_count DESC
       LIMIT $3`,
      [period.from, period.to, limit],
    );
    return rows.map((r: Record<string, unknown>) => ({
      eventCategory: String(r.event_category),
      eventType: String(r.event_type),
      totalCount: Number(r.total_count ?? 0),
      sessionsCount: Number(r.sessions_count ?? 0),
    }));
  }

  private async healthySessionRate(period: ResolvedPeriod): Promise<number> {
    const rows = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed')::int AS healthy,
         COUNT(*)::int AS total
       FROM game_sessions
       WHERE created_at >= $1 AND created_at <= $2`,
      [period.from, period.to],
    );
    const total = Number(rows[0]?.total ?? 0);
    if (total === 0) return 0;
    return Number((Number(rows[0]?.healthy ?? 0) / total).toFixed(4));
  }

  private async activationRate24h(period: ResolvedPeriod): Promise<number> {
    const rows = await this.ds.query(
      `WITH new_users AS (
         SELECT id, created_at FROM users
         WHERE created_at >= $1 AND created_at <= $2
       ),
       activated AS (
         SELECT u.id
         FROM new_users u
         JOIN characters c ON c.user_id = u.id AND c.created_at <= u.created_at + interval '24 hours'
         JOIN game_sessions gs ON gs.owner_id = u.id AND gs.created_at <= u.created_at + interval '24 hours'
         GROUP BY u.id
       )
       SELECT
         (SELECT COUNT(*) FROM new_users)::int AS total,
         (SELECT COUNT(*) FROM activated)::int AS activated`,
      [period.from, period.to],
    );
    const total = Number(rows[0]?.total ?? 0);
    if (total === 0) return 0;
    return Number((Number(rows[0]?.activated ?? 0) / total).toFixed(4));
  }

  private async totalSessionsInPeriod(period: ResolvedPeriod): Promise<number> {
    const rows = await this.ds.query(
      `SELECT COUNT(*)::int AS total
       FROM game_sessions
       WHERE created_at >= $1 AND created_at <= $2`,
      [period.from, period.to],
    );
    return Number(rows[0]?.total ?? 0);
  }



  async getLogs(query: LogsQueryDto): Promise<LogsResponse> {
    const period = this.resolvePeriod(query);
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const cursor = this.parseCursor(query.cursor);

    const sources: Array<"session_event" | "ai_usage" | "admin_audit"> =
      query.source
        ? [query.source]
        : ["session_event", "ai_usage", "admin_audit"];

    const allRows: LogRow[] = [];
    for (const src of sources) {
      const rows = await this.fetchLogSource(src, period, query, cursor, limit);
      allRows.push(...rows);
    }

    allRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sliced = allRows.slice(0, limit);
    const last = sliced[sliced.length - 1];
    const hasMore = allRows.length > limit;

    return {
      rows: sliced,
      nextCursor:
        last && hasMore ? this.encodeCursor(last.createdAt, last.id) : null,
      hasMore,
    };
  }

  async exportLogsCsv(query: LogsQueryDto): Promise<string> {
    const period = this.resolvePeriod(query);
    const sources: Array<"session_event" | "ai_usage" | "admin_audit"> =
      query.source
        ? [query.source]
        : ["session_event", "ai_usage", "admin_audit"];

    const rows: LogRow[] = [];
    for (const src of sources) {
      const partial = await this.fetchLogSource(
        src,
        period,
        query,
        null,
        EXPORT_ROW_LIMIT,
      );
      rows.push(...partial);
      if (rows.length > EXPORT_ROW_LIMIT) {
        throw new ValidationException(
          ErrorCode.ADMIN_METRICS_EXPORT_LIMIT_EXCEEDED,
          `Export excedeu ${EXPORT_ROW_LIMIT} linhas — restrinja período/filtros.`,
        );
      }
    }

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sliced = rows.slice(0, EXPORT_ROW_LIMIT);
    return this.toCsv(sliced);
  }

  private async fetchLogSource(
    source: "session_event" | "ai_usage" | "admin_audit",
    period: ResolvedPeriod,
    query: LogsQueryDto,
    cursor: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<LogRow[]> {
    if (source === "ai_usage") {
      return this.fetchAiUsageLogs(period, query, cursor, limit);
    }
    if (source === "admin_audit") {
      return this.fetchAdminAuditLogs(period, query, cursor, limit);
    }
    return this.fetchSessionEvents(period, query, cursor, limit);
  }

  private async fetchAiUsageLogs(
    period: ResolvedPeriod,
    query: LogsQueryDto,
    cursor: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<LogRow[]> {
    const params: unknown[] = [period.from, period.to];
    let where = "aul.created_at >= $1 AND aul.created_at <= $2";
    if (query.userId) {
      params.push(query.userId);
      where += ` AND c.dm_user_id = $${params.length}`;
    }
    if (query.featureName) {
      params.push(query.featureName);
      where += ` AND aul.feature_name = $${params.length}`;
    }
    if (query.model) {
      params.push(query.model);
      where += ` AND aul.model_id = $${params.length}`;
    }
    if (cursor) {
      params.push(cursor.createdAt);
      params.push(cursor.id);
      where += ` AND (aul.created_at, aul.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit);

    const rows = await this.ds.query(
      `SELECT aul.id::text, aul.created_at,
              aul.session_id::text, c.dm_user_id::text AS user_id,
              u.email, aul.agent_role, aul.model_id, aul.feature_name,
              aul.cost_usd, aul.input_tokens, aul.output_tokens,
              aul.cache_read_tokens, aul.cache_creation_tokens,
              aul.took_ms, aul.scene_type, aul.turn_number, aul.character_id::text
       FROM ai_usage_logs aul
       LEFT JOIN campaigns c ON c.id = aul.campaign_id
       LEFT JOIN users u ON u.id = c.dm_user_id
       WHERE ${where}
       ORDER BY aul.created_at DESC, aul.id DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      source: "ai_usage" as const,
      id: String(r.id),
      createdAt: new Date(r.created_at as string).toISOString(),
      summary: `${r.agent_role} ${r.model_id} ${Number(r.cost_usd ?? 0).toFixed(6)} USD`,
      eventType: r.feature_name ? String(r.feature_name) : null,
      sessionId: r.session_id ? String(r.session_id) : null,
      userId: r.user_id ? String(r.user_id) : null,
      email: r.email ? String(r.email) : null,
      agentRole: r.agent_role ? String(r.agent_role) : null,
      modelId: r.model_id ? String(r.model_id) : null,
      featureName: r.feature_name ? String(r.feature_name) : null,
      costUsd: Number(r.cost_usd ?? 0),
      payload: {
        inputTokens: Number(r.input_tokens ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
        cacheReadTokens: Number(r.cache_read_tokens ?? 0),
        cacheCreationTokens: Number(r.cache_creation_tokens ?? 0),
        tookMs: r.took_ms ? Number(r.took_ms) : null,
        sceneType: r.scene_type ?? null,
        turnNumber: r.turn_number ?? null,
        characterId: r.character_id ?? null,
      },
    }));
  }

  private async fetchSessionEvents(
    period: ResolvedPeriod,
    query: LogsQueryDto,
    cursor: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<LogRow[]> {
    const params: unknown[] = [period.from, period.to];
    let where = "se.created_at >= $1 AND se.created_at <= $2";
    if (query.eventType) {
      params.push(query.eventType);
      where += ` AND se.event_type = $${params.length}`;
    }
    if (query.traceId) {
      params.push(query.traceId);
      where += ` AND se.trace_id = $${params.length}`;
    }
    if (cursor) {
      params.push(cursor.createdAt);
      params.push(cursor.id);
      where += ` AND (se.created_at, se.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit);

    const rows = await this.ds.query(
      `SELECT se.id::text, se.created_at, se.session_id::text, se.event_type,
              se.event_category, se.summary, se.event_payload, se.trace_id
       FROM session_events se
       WHERE ${where}
       ORDER BY se.created_at DESC, se.id DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      source: "session_event" as const,
      id: String(r.id),
      createdAt: new Date(r.created_at as string).toISOString(),
      summary: String(r.summary ?? ""),
      category: r.event_category ? String(r.event_category) : null,
      eventType: r.event_type ? String(r.event_type) : null,
      sessionId: r.session_id ? String(r.session_id) : null,
      traceId: r.trace_id ? String(r.trace_id) : null,
      payload: (r.event_payload as Record<string, unknown>) ?? {},
    }));
  }

  private async fetchAdminAuditLogs(
    period: ResolvedPeriod,
    query: LogsQueryDto,
    cursor: { createdAt: string; id: string } | null,
    limit: number,
  ): Promise<LogRow[]> {
    const params: unknown[] = [period.from, period.to];
    let where = "al.created_at >= $1 AND al.created_at <= $2";
    if (query.userId) {
      params.push(query.userId);
      where += ` AND al.admin_id = $${params.length}`;
    }
    if (query.traceId) {
      params.push(query.traceId);
      where += ` AND al.trace_id = $${params.length}`;
    }
    if (cursor) {
      params.push(cursor.createdAt);
      params.push(cursor.id);
      where += ` AND (al.created_at, al.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit);

    const rows = await this.ds.query(
      `SELECT al.id::text, al.created_at, al.action, al.target_entity, al.target_id,
              al.details, al.trace_id, al.admin_id::text, u.email
       FROM admin_audit_log al
       LEFT JOIN users u ON u.id = al.admin_id
       WHERE ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      source: "admin_audit" as const,
      id: String(r.id),
      createdAt: new Date(r.created_at as string).toISOString(),
      summary: `${r.action}${r.target_entity ? ` ${r.target_entity}:${r.target_id}` : ""}`,
      eventType: r.action ? String(r.action) : null,
      userId: r.admin_id ? String(r.admin_id) : null,
      email: r.email ? String(r.email) : null,
      traceId: r.trace_id ? String(r.trace_id) : null,
      payload: (r.details as Record<string, unknown>) ?? {},
    }));
  }



  async refreshMatviews(): Promise<{ refreshedAt: string }> {
    await this.ds.query(`SELECT refresh_admin_metrics_matviews()`);
    return { refreshedAt: new Date().toISOString() };
  }



  private formatPeriod(p: ResolvedPeriod) {
    return {
      from: p.from.toISOString(),
      to: p.to.toISOString(),
      days: p.days,
    };
  }

  private encodeCursor(createdAt: string, id: string): string {
    return Buffer.from(`${createdAt}|${id}`, "utf-8").toString("base64");
  }

  private parseCursor(
    cursor: string | undefined,
  ): { createdAt: string; id: string } | null {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, "base64").toString("utf-8");
      const [createdAt, id] = decoded.split("|");
      if (!createdAt || !id) {
        throw new Error("formato inválido");
      }
      return { createdAt, id };
    } catch {
      throw new ValidationException(
        ErrorCode.ADMIN_METRICS_FILTER_INVALID,
        "Cursor inválido",
      );
    }
  }

  private toCsv(rows: LogRow[]): string {
    const header = [
      "source",
      "id",
      "createdAt",
      "summary",
      "category",
      "eventType",
      "sessionId",
      "userId",
      "email",
      "agentRole",
      "modelId",
      "featureName",
      "costUsd",
      "traceId",
      "payload",
    ].join(",");

    const lines = rows.map((r) => {
      const cells = [
        r.source,
        r.id,
        r.createdAt,
        r.summary,
        r.category ?? "",
        r.eventType ?? "",
        r.sessionId ?? "",
        r.userId ?? "",
        r.email ?? "",
        r.agentRole ?? "",
        r.modelId ?? "",
        r.featureName ?? "",
        r.costUsd ?? "",
        r.traceId ?? "",
        JSON.stringify(r.payload ?? {}),
      ];
      return cells.map(csvEscape).join(",");
    });

    return [header, ...lines].join("\r\n");
  }
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
