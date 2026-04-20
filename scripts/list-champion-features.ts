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
    const rows = await ds.query(
      `SELECT f.slug, f.name, f.level, c.slug as class_slug, s.slug as subclass_slug
       FROM features f
       LEFT JOIN classes c ON c.id = f.class_id
       LEFT JOIN subclasses s ON s.id = f.subclass_id
       WHERE s.slug IN ('champion', 'battle-master', 'eldritch-knight', 'psi-warrior')
          OR f.name ILIKE '%critical%'
          OR f.name ILIKE '%remarkable%'
          OR f.name ILIKE '%heroic warrior%'
          OR f.name ILIKE '%survivor%'
       ORDER BY s.slug NULLS LAST, f.level, f.slug`,
    );
    console.table(rows);
    console.log(`\nTotal: ${rows.length}`);
    await ds.destroy();
  })
  .catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
