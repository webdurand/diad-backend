import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  synchronize: false,
  logging: false,
  entities: [],
});

(async () => {
  await ds.initialize();
  const rows: Array<{ slug: string; name: string; casting_time: string }> = await ds.query(
    `SELECT slug, name, casting_time FROM spells WHERE casting_time = '1 bonus' OR casting_time LIKE '1 bonus,%' ORDER BY slug`,
  );
  console.log(`Total: ${rows.length}`);
  for (const r of rows) console.log(`${r.slug} | ${r.name} | "${r.casting_time}"`);
  await ds.destroy();
})();
