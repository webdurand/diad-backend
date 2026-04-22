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
      `SELECT s.slug, s.name, c.slug as class_slug
       FROM subclasses s
       LEFT JOIN classes c ON c.id = s.class_id
       ORDER BY c.slug, s.slug`,
    );
    console.table(rows);
    await ds.destroy();
  })
  .catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
