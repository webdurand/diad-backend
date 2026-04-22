import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`SELECT f.slug, f.name FROM level_features lf JOIN features f ON f.id=lf.feature_id WHERE lf.level_id='ead22c87-0a87-4192-8b52-93d138000f95'`);
  console.log('Champion L10 features:', rows);
  await ds.destroy();
}).catch(console.error);
