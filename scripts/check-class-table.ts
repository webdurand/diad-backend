import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%class%' OR table_name LIKE '%subclass%' OR table_name LIKE '%level%')");
  console.log('tables:', t.rows.map((r) => r.table_name).join(','));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
