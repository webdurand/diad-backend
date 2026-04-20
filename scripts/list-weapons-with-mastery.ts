/* eslint-disable @typescript-eslint/no-explicit-any */
// Lista armas com/sem mastery setada — diagnóstico pra spec 012 Fase 0.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  logging: false,
  entities: [],
});

ds.initialize()
  .then(async () => {
    const rows = await ds.query(
      `SELECT slug, name, mastery
       FROM equipments
       WHERE damage IS NOT NULL
         AND (slug LIKE '%sword%' OR slug LIKE '%axe%' OR slug LIKE '%flail%'
              OR slug LIKE '%hammer%' OR slug LIKE '%javelin%' OR slug LIKE '%rapier%'
              OR slug LIKE '%maul%' OR slug LIKE '%club%' OR slug LIKE '%mace%'
              OR slug LIKE '%pike%' OR slug LIKE '%glaive%' OR slug LIKE '%halberd%'
              OR slug LIKE '%sickle%' OR slug LIKE '%handaxe%' OR slug LIKE '%dagger%')
       ORDER BY slug`,
    );
    console.table(rows.map((r: any) => ({
      slug: r.slug,
      name: r.name,
      mastery: r.mastery ? r.mastery.slug : '—',
    })));
    console.log(`\nTotal: ${rows.length}`);
    console.log(`Com mastery: ${rows.filter((r: any) => r.mastery).length}`);
    console.log(`Sem mastery: ${rows.filter((r: any) => !r.mastery).length}`);
    await ds.destroy();
  })
  .catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
