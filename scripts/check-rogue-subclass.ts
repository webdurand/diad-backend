import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const r = await c.query("SELECT slug, name FROM subclasses WHERE slug ILIKE '%thief%' OR slug ILIKE '%rogue%'");
  console.log(r.rows);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
