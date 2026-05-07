import pg from "pg";
const c = new pg.Client({
  connectionString:
    "postgresql://neondb_owner:npg_d1UMJqT9Gyit@ep-bold-mountain-ac1b02ds-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require",
});
await c.connect();
const r = await c.query(
  `SELECT COUNT(*)::int AS total,
          MAX(created_at) AS most_recent,
          STRING_AGG(DISTINCT agent_role, ', ' ORDER BY agent_role) AS roles_seen
   FROM ai_usage_logs`,
);
console.log("ai_usage_logs state:", r.rows[0]);
await c.end();
