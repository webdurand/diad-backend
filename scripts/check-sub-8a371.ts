import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`SELECT id, slug, class_id FROM subclasses WHERE slug LIKE 'champion%' OR slug LIKE '%champion'`);
  console.log(rows);
  await ds.destroy();
}).catch(console.error);
