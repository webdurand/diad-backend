import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const r = await c.query("SELECT id, slug, name, actions::text FROM monsters WHERE id = '3f87cafd-006b-4b99-ad93-530df46d2492'");
  if (r.rows.length === 0) { console.log('not found'); } else { console.log('slug:', r.rows[0].slug, 'name:', r.rows[0].name); console.log('actions:', r.rows[0].actions?.slice(0, 1000)); }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
