import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`
    SELECT f.level, f.slug, f.name
    FROM features f
    JOIN classes c ON c.id = f.class_id
    WHERE c.slug = 'fighter' AND f.level <= 9 AND f.subclass_id IS NULL
    ORDER BY f.level, f.slug
  `);
  console.table(rows);
  await ds.destroy();
}).catch(console.error);
