/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  logging: false,
  entities: [],
});

ds.initialize().then(async () => {
  const rows = await ds.query(
    `SELECT slug, name, level FROM features WHERE slug ILIKE '%studied%' ORDER BY slug`,
  );
  console.table(rows);
  await ds.destroy();
}).catch((err: any) => { console.error(err.message); process.exit(1); });
