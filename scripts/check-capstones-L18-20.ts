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
  const r = await c.query(`
    SELECT DISTINCT l.level, cl.slug AS class_slug, sc.slug AS subclass_slug, f.slug, f.name
    FROM levels l
    LEFT JOIN classes cl ON cl.id = l.class_id
    LEFT JOIN subclasses sc ON sc.id = l.subclass_id
    JOIN level_features lf ON lf.level_id = l.id
    JOIN features f ON f.id = lf.feature_id
    WHERE l.level IN (18, 19, 20)
    ORDER BY l.level, cl.slug, sc.slug NULLS FIRST, f.slug
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
