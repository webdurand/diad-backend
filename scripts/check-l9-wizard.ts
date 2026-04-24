import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const r = await c.query(`SELECT s.slug, s.name, s.level FROM spells s JOIN spell_classes sc ON sc.spell_id=s.id JOIN classes c ON c.id=sc.class_id WHERE s.level=9 AND c.slug='wizard' ORDER BY s.slug`);
  console.log(r.rows.map(r => r.slug));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
