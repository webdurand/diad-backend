import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  const r = await c.query(
    "SELECT slug, name FROM features WHERE slug ILIKE '%land%stride%' OR slug ILIKE '%land-s-stride%' OR name ILIKE '%land%stride%'",
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
