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

ds.initialize()
  .then(async () => {
    // Lista rows em levels pra champion
    const levels = await ds.query(
      `SELECT l.id, l.level, c.slug as class_slug, s.slug as subclass_slug
       FROM levels l
       LEFT JOIN classes c ON c.id = l.class_id
       LEFT JOIN subclasses s ON s.id = l.subclass_id
       WHERE s.slug LIKE '%champion%' OR (c.slug LIKE 'fighter%' AND s.slug IS NULL AND l.level = 3)
       ORDER BY c.slug, s.slug NULLS FIRST, l.level`,
    );
    console.table(levels);

    // Features per subclass level
    const feats = await ds.query(
      `SELECT l.level, s.slug as subclass_slug, f.slug as feature_slug, f.name
       FROM levels l
       JOIN level_features lf ON lf.level_id = l.id
       JOIN features f ON f.id = lf.feature_id
       LEFT JOIN subclasses s ON s.id = l.subclass_id
       WHERE s.slug LIKE '%champion%'
       ORDER BY s.slug, l.level, f.slug`,
    );
    console.log('\nLevel features por subclass:');
    console.table(feats);

    await ds.destroy();
  })
  .catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
