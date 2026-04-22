import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const rows = await ds.query(`SELECT f.slug, f.name, f.level FROM features f JOIN subclasses s ON s.id=f.subclass_id WHERE s.slug='fighter-eldritch-knight' ORDER BY f.level, f.slug`);
  console.log('EK features XPHB:', rows);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
