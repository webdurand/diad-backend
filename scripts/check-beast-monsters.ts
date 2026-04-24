import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const res = await client.query(`
    SELECT slug, name, challenge_rating, hit_points
    FROM monsters
    WHERE slug ILIKE '%bear%' OR slug ILIKE '%wolf%' OR slug ILIKE '%ape%'
       OR slug ILIKE '%panther%' OR slug ILIKE '%tiger%' OR slug ILIKE '%eagle%'
       OR slug ILIKE '%boar%' OR slug ILIKE '%spider%'
    ORDER BY challenge_rating::float NULLS LAST
    LIMIT 30
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch(e => { console.error(e.message ?? e); process.exit(1); });
