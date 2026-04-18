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
    `SELECT slug, name, casting_time FROM spells ORDER BY casting_time, slug`,
  );
  const groups = new Map<string, Array<{ slug: string; name: string }>>();
  for (const r of rows) {
    const key = r.casting_time ?? '(null)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ slug: r.slug, name: r.name });
  }
  for (const [key, items] of [...groups.entries()].sort()) {
    console.log(`\n=== casting_time = "${key}" (${items.length}) ===`);
    for (const it of items.slice(0, 5)) console.log(`  ${it.slug} | ${it.name}`);
    if (items.length > 5) console.log(`  ... +${items.length - 5} more`);
  }
  await ds.destroy();
})();
