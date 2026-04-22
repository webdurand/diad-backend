import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const levels = await ds.query(`
    SELECT l.id, l.level, l.subclass_id, s.slug, s.class_id
    FROM levels l JOIN subclasses s ON s.id = l.subclass_id
    WHERE s.slug LIKE 'fighter-battle-master%' OR s.slug = 'battle-master'
    ORDER BY s.slug, l.level
  `);
  console.log('BM levels:', levels);
  const feats = await ds.query(`
    SELECT f.slug, f.name, f.level, f.subclass_id, s.slug as sub
    FROM features f JOIN subclasses s ON s.id = f.subclass_id
    WHERE s.slug LIKE 'fighter-battle-master%'
    ORDER BY f.level, f.slug
  `);
  console.log('BM features:', feats);
  await ds.destroy();
}).catch(console.error);
