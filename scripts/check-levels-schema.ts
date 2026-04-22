import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const cols = await ds.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='levels' ORDER BY ordinal_position`);
  console.log(cols);
  const sample = await ds.query(`SELECT * FROM levels WHERE subclass_id IS NOT NULL LIMIT 2`);
  console.log('sample:', JSON.stringify(sample, null, 2).slice(0, 800));
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
