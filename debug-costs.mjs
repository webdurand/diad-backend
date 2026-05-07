import pg from "pg";
const { Client } = pg;

const url =
  "postgresql://neondb_owner:npg_d1UMJqT9Gyit@ep-bold-mountain-ac1b02ds-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const client = new Client({ connectionString: url });
await client.connect();

async function show(label, sql, params = []) {
  console.log(`\n=== ${label} ===`);
  try {
    const r = await client.query(sql, params);
    console.table(r.rows);
  } catch (e) {
    console.log("ERR:", e.message);
  }
}

await show(
  "users (recent 10)",
  `SELECT id::text, email, created_at FROM users ORDER BY created_at DESC LIMIT 10`,
);

await show(
  "ai_usage_logs total + with campaign_id",
  `SELECT
     COUNT(*)::int AS total,
     COUNT(*) FILTER (WHERE campaign_id IS NOT NULL)::int AS with_campaign,
     COUNT(*) FILTER (WHERE campaign_id IS NULL)::int AS without_campaign,
     MIN(created_at) AS oldest,
     MAX(created_at) AS newest
   FROM ai_usage_logs`,
);

await show(
  "ai_usage_logs in last 30 days by user (via campaign join)",
  `SELECT
     u.email,
     COUNT(*)::int AS calls,
     ROUND(SUM(aul.cost_usd)::numeric, 6) AS total_cost_usd,
     SUM(aul.input_tokens)::int AS input_tokens,
     SUM(aul.output_tokens)::int AS output_tokens
   FROM ai_usage_logs aul
   LEFT JOIN campaigns c ON c.id = aul.campaign_id
   LEFT JOIN users u ON u.id = c.dm_user_id
   WHERE aul.created_at > now() - interval '30 days'
   GROUP BY u.email
   ORDER BY calls DESC`,
);

await show(
  "ai_usage_logs sample (last 5)",
  `SELECT id::text, created_at, campaign_id::text, session_id::text, agent_role, model_id, feature_name, cost_usd, input_tokens, output_tokens
   FROM ai_usage_logs
   ORDER BY created_at DESC
   LIMIT 5`,
);

await show(
  "mv_admin_costs_daily total + groupings",
  `SELECT
     COUNT(*)::int AS rows,
     COUNT(*) FILTER (WHERE dm_user_id IS NOT NULL)::int AS with_user,
     COUNT(*) FILTER (WHERE dm_user_id IS NULL)::int AS without_user,
     ROUND(SUM(cost_usd)::numeric, 6) AS total_cost_usd
   FROM mv_admin_costs_daily`,
);

await show(
  "mv_admin_costs_daily by user (last 30d)",
  `SELECT
     m.dm_user_id::text,
     u.email,
     ROUND(SUM(m.cost_usd)::numeric, 6) AS cost_usd,
     SUM(m.calls)::int AS calls
   FROM mv_admin_costs_daily m
   LEFT JOIN users u ON u.id = m.dm_user_id
   WHERE m.day > now() - interval '30 days'
   GROUP BY m.dm_user_id, u.email
   ORDER BY cost_usd DESC NULLS LAST`,
);

await show(
  "campaigns count + dm_user_id presence",
  `SELECT
     COUNT(*)::int AS total,
     COUNT(*) FILTER (WHERE dm_user_id IS NOT NULL)::int AS with_dm
   FROM campaigns`,
);

await show(
  "session_events activity (last 30d) by user",
  `SELECT
     u.email,
     COUNT(*)::int AS events,
     MIN(se.created_at) AS first_at,
     MAX(se.created_at) AS last_at
   FROM session_events se
   LEFT JOIN game_sessions gs ON gs.id = se.session_id
   LEFT JOIN campaigns c ON c.id = gs.campaign_id
   LEFT JOIN users u ON u.id = c.dm_user_id
   WHERE se.created_at > now() - interval '30 days'
   GROUP BY u.email
   ORDER BY events DESC
   LIMIT 10`,
);

await show(
  "session_events sample (last 10) — to see what's running",
  `SELECT created_at, event_type, event_category, session_id::text
   FROM session_events
   ORDER BY created_at DESC
   LIMIT 10`,
);

await show(
  "ai_usage_logs schema check",
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'ai_usage_logs'
   ORDER BY ordinal_position`,
);

await show(
  "campaigns recent + dm_user_id",
  `SELECT id::text, name, dm_user_id::text, created_at
   FROM campaigns
   ORDER BY created_at DESC LIMIT 5`,
);

await client.end();
