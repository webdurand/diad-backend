import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminMetricsMatviews1783000020000 implements MigrationInterface {
  name = "CreateAdminMetricsMatviews1783000020000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_admin_costs_daily AS
      SELECT
        date_trunc('day', aul.created_at)::timestamptz AS day,
        aul.model_id,
        aul.agent_role,
        aul.feature_name,
        c.dm_user_id,
        COUNT(*)::bigint AS calls,
        SUM(aul.input_tokens)::bigint AS input_tokens,
        SUM(aul.output_tokens)::bigint AS output_tokens,
        SUM(aul.cache_creation_tokens)::bigint AS cache_creation_tokens,
        SUM(aul.cache_read_tokens)::bigint AS cache_read_tokens,
        SUM(aul.cost_usd)::numeric(14,6) AS cost_usd,
        AVG(aul.took_ms)::numeric(10,2) AS avg_took_ms
      FROM ai_usage_logs aul
      LEFT JOIN campaigns c ON c.id = aul.campaign_id
      WHERE aul.created_at > now() - interval '90 days'
      GROUP BY 1, 2, 3, 4, 5
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_admin_costs_daily_pk
        ON mv_admin_costs_daily(day, model_id, agent_role, feature_name, dm_user_id)
        NULLS NOT DISTINCT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_admin_costs_daily_user
        ON mv_admin_costs_daily(dm_user_id, day DESC)
        WHERE dm_user_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_admin_costs_daily_model
        ON mv_admin_costs_daily(model_id, day DESC)
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_admin_usage_daily AS
      SELECT
        date_trunc('day', aul.created_at)::timestamptz AS day,
        COUNT(DISTINCT c.dm_user_id) FILTER (WHERE c.dm_user_id IS NOT NULL)::bigint AS active_users,
        COUNT(DISTINCT aul.session_id) FILTER (WHERE aul.session_id IS NOT NULL)::bigint AS active_sessions,
        COUNT(DISTINCT aul.campaign_id) FILTER (WHERE aul.campaign_id IS NOT NULL)::bigint AS active_campaigns,
        SUM(aul.cost_usd)::numeric(14,6) AS total_cost_usd,
        COUNT(*)::bigint AS total_calls
      FROM ai_usage_logs aul
      LEFT JOIN campaigns c ON c.id = aul.campaign_id
      WHERE aul.created_at > now() - interval '180 days'
      GROUP BY 1
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_admin_usage_daily_pk
        ON mv_admin_usage_daily(day)
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_admin_features_daily AS
      SELECT
        date_trunc('day', se.created_at)::timestamptz AS day,
        COALESCE(se.event_category, 'Legacy') AS event_category,
        se.event_type,
        COUNT(*)::bigint AS event_count,
        COUNT(DISTINCT se.session_id)::bigint AS sessions_count
      FROM session_events se
      WHERE se.created_at > now() - interval '90 days'
      GROUP BY 1, 2, 3
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_admin_features_daily_pk
        ON mv_admin_features_daily(day, event_category, event_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_admin_features_daily_type
        ON mv_admin_features_daily(event_type, day DESC)
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_admin_cohort_weekly AS
      WITH first_activity AS (
        SELECT
          c.dm_user_id,
          date_trunc('week', MIN(aul.created_at))::timestamptz AS cohort_week
        FROM ai_usage_logs aul
        JOIN campaigns c ON c.id = aul.campaign_id
        WHERE c.dm_user_id IS NOT NULL
        GROUP BY c.dm_user_id
      ),
      weekly_activity AS (
        SELECT DISTINCT
          c.dm_user_id,
          date_trunc('week', aul.created_at)::timestamptz AS active_week
        FROM ai_usage_logs aul
        JOIN campaigns c ON c.id = aul.campaign_id
        WHERE c.dm_user_id IS NOT NULL
      ),
      cohort_sizes AS (
        SELECT cohort_week, COUNT(*)::bigint AS cohort_size
        FROM first_activity
        GROUP BY cohort_week
      )
      SELECT
        fa.cohort_week,
        wa.active_week,
        COUNT(DISTINCT wa.dm_user_id)::bigint AS users_active,
        cs.cohort_size,
        (COUNT(DISTINCT wa.dm_user_id)::numeric / NULLIF(cs.cohort_size, 0))::numeric(6,4) AS retention_rate
      FROM first_activity fa
      JOIN weekly_activity wa ON wa.dm_user_id = fa.dm_user_id
      JOIN cohort_sizes cs ON cs.cohort_week = fa.cohort_week
      WHERE wa.active_week >= fa.cohort_week
      GROUP BY fa.cohort_week, wa.active_week, cs.cohort_size
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_admin_cohort_weekly_pk
        ON mv_admin_cohort_weekly(cohort_week, active_week)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION refresh_admin_metrics_matviews()
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_costs_daily;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_usage_daily;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_features_daily;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_admin_cohort_weekly;
      END;
      $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS refresh_admin_metrics_matviews()`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_admin_cohort_weekly`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_admin_features_daily`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_admin_usage_daily`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_admin_costs_daily`,
    );
  }
}
