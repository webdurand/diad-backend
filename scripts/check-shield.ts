import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`SELECT slug, name, armor_class, properties FROM equipments WHERE slug ILIKE '%shield%' LIMIT 5`);
  console.log(JSON.stringify(rows, null, 2));
  await ds.destroy();
}).catch(console.error);
