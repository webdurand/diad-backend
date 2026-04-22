import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`
    SELECT l.id, l.level, s.slug as subclass_slug
    FROM levels l
    JOIN subclasses s ON s.id = l.subclass_id
    WHERE s.slug LIKE 'champion%' OR s.slug LIKE 'fighter-champion%'
    ORDER BY l.level, s.slug
  `);
  console.table(rows);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
