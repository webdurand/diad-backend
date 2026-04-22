/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const r = await ds.query(
    `SELECT s.slug AS sub, l.level, f.slug, f.name FROM levels l
     JOIN level_features lf ON lf.level_id = l.id JOIN features f ON f.id = lf.feature_id
     JOIN classes c ON c.id = l.class_id JOIN subclasses s ON s.id = l.subclass_id
     WHERE c.slug = 'warlock' AND s.slug IN ('fiend', 'warlock-fiend') ORDER BY s.slug, l.level`);
  console.table(r);
  await ds.destroy();
}).catch((e: any) => { console.error(e.message); process.exit(1); });
