import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  // Descobrir colunas
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='levels'");
  console.log('levels cols:', cols.rows.map((r) => r.column_name).join(','));
  const cols2 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='character_classes'");
  console.log('character_classes cols:', cols2.rows.map((r) => r.column_name).join(','));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
