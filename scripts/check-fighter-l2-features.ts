import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const l1 = await ds.query(`SELECT f.slug, f.name FROM level_features lf JOIN features f ON f.id=lf.feature_id WHERE lf.level_id='5bcbed81-1794-4627-aae1-5b011925d37a'`);
  console.log('level 5bcbed81:', l1);
  const l2 = await ds.query(`SELECT f.slug, f.name FROM level_features lf JOIN features f ON f.id=lf.feature_id WHERE lf.level_id='6873778c-75ec-4a41-8ecd-dca639592c6d'`);
  console.log('level 6873778c:', l2);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
