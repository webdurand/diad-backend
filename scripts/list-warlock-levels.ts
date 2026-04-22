/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const base = await ds.query(
    `SELECT l.level, f.slug, f.name FROM levels l
     JOIN level_features lf ON lf.level_id = l.id JOIN features f ON f.id = lf.feature_id
     JOIN classes c ON c.id = l.class_id
     WHERE c.slug = 'warlock' AND l.subclass_id IS NULL ORDER BY l.level, f.slug`);
  console.log('\n=== WARLOCK BASE ==='); console.table(base);
  const subs = await ds.query(`SELECT s.slug, s.name FROM subclasses s JOIN classes c ON c.id = s.class_id WHERE c.slug = 'warlock' ORDER BY s.slug`);
  console.log('\n=== WARLOCK SUBCLASSES ==='); console.table(subs);
  const subFeat = await ds.query(
    `SELECT s.slug AS sub, l.level, f.slug, f.name FROM levels l
     JOIN level_features lf ON lf.level_id = l.id JOIN features f ON f.id = lf.feature_id
     JOIN classes c ON c.id = l.class_id JOIN subclasses s ON s.id = l.subclass_id
     WHERE c.slug = 'warlock' AND s.slug = 'warlock-fiend' ORDER BY l.level`);
  console.log('\n=== FIEND FEATURES ==='); console.table(subFeat);
  await ds.destroy();
}).catch((e: any) => { console.error(e.message); process.exit(1); });
