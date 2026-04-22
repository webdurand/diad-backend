import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`
    SELECT l.level, f.slug, f.name
    FROM level_features lf
    JOIN levels l ON l.id = lf.level_id
    JOIN features f ON f.id = lf.feature_id
    JOIN classes c ON c.id = l.class_id
    WHERE c.slug = 'fighter' AND l.level <= 9 AND l.subclass_id IS NULL
    ORDER BY l.level, f.slug
  `);
  console.table(rows);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
