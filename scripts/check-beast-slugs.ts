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
    "SELECT slug, name, challenge_rating, hit_points FROM monsters WHERE slug IN ('brown-bear','wolf','giant-eagle','ape','black-bear','polar-bear','tiger','giant-wolf-spider') ORDER BY challenge_rating::float NULLS LAST",
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
