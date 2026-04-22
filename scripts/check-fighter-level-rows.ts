import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const classes = await ds.query(`SELECT id, slug, name, source_id FROM classes WHERE slug LIKE 'fighter%' ORDER BY slug`);
  console.log('classes:', classes);
  const sources = await ds.query(`SELECT id, code, name FROM comp_sources WHERE code IN ('PHB', 'XPHB')`);
  console.log('sources:', sources);
  const levels = await ds.query(`
    SELECT l.id, l.level, l.class_id, c.slug as class_slug, c.source_id
    FROM levels l JOIN classes c ON c.id = l.class_id
    WHERE c.slug LIKE 'fighter%' AND l.level = 2 AND l.subclass_id IS NULL
  `);
  console.log('level 2 rows:', levels);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
