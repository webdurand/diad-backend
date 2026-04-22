import 'reflect-metadata'; import { DataSource } from 'typeorm'; import * as dotenv from 'dotenv'; dotenv.config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, logging: false, entities: [] });
ds.initialize().then(async () => {
  const subs = await ds.query(`SELECT id, slug, class_id FROM subclasses WHERE slug LIKE '%battle-master%' OR slug LIKE '%eldritch-knight%' OR slug LIKE '%psi-warrior%' OR slug IN ('battle-master','eldritch-knight','psi-warrior') ORDER BY slug`);
  console.log('Subs:', subs);
  const bmFeat = await ds.query(`SELECT f.slug, f.name, f.level FROM features f WHERE f.slug ILIKE '%battle-master%' OR f.slug ILIKE '%superiority%' OR f.slug ILIKE '%maneuver%' OR f.slug ILIKE '%know-your%' OR f.slug ILIKE '%relentless%' ORDER BY f.level, f.slug LIMIT 30`);
  console.log('BM features:', bmFeat);
  const ekFeat = await ds.query(`SELECT f.slug, f.name, f.level FROM features f WHERE f.slug ILIKE '%eldritch-knight%' OR f.slug ILIKE '%war-bond%' OR f.slug ILIKE '%war-magic%' OR f.slug ILIKE '%arcane-charge%' ORDER BY f.level, f.slug LIMIT 20`);
  console.log('EK features:', ekFeat);
  const pwFeat = await ds.query(`SELECT f.slug, f.name, f.level FROM features f WHERE f.slug ILIKE '%psi-warrior%' OR f.slug ILIKE '%psionic%' OR f.slug ILIKE '%protective-field%' OR f.slug ILIKE '%telekinetic%' OR f.slug ILIKE '%guarded-mind%' ORDER BY f.level, f.slug LIMIT 20`);
  console.log('PW features:', pwFeat);
  await ds.destroy();
}).catch((err) => { console.error(err.message); process.exit(1); });
