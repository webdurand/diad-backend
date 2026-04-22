import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`
    SELECT l.id, l.level, l.class_id, l.subclass_id, s.slug as sub
    FROM levels l
    LEFT JOIN subclasses s ON s.id = l.subclass_id
    WHERE s.slug = 'champion' AND l.level = 10
  `);
  console.log(rows);
  await ds.destroy();
}).catch(console.error);
