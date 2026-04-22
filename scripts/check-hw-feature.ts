import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`SELECT id, slug, level, subclass_id FROM features WHERE slug LIKE 'heroic-warrior%' OR slug LIKE 'remarkable-athlete%' OR slug LIKE 'survivor%'`);
  console.log(rows);
  const champ = await ds.query(`SELECT id, slug FROM subclasses WHERE slug = 'champion'`);
  console.log('champion:', champ);
  await ds.destroy();
}).catch(console.error);
