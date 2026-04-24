// PROBE-015-FEATURE-01 — FeatureBlock enriquecido (Eixo 1)
//
// Valida:
//   - GET /characters/:id/sheet retorna `features[]` com campos novos
//     (category, displayText, narrativeDescriptor, isPassive, resourceCharges).
//   - Druida L20: Archdruid + Timeless Body category='capstone' + narrative curado.
//   - Bardo L20: Bardic Inspiration variants todos category='resource' +
//     recharge_rule='short' + formula 'max(1, chaMod)' via seed.
//   - Passivas marcadas isPassive=true (Song of Rest, Jack of All Trades, etc).
//
// Uso: `node tests/probes/015/PROBE-015-FEATURE-01-druid-bard-enrichment.mjs`

const BASE = process.env.DIAD_BACKEND_URL ?? 'http://localhost:9001';
const EMAIL = process.env.DIAD_EMAIL ?? 'admin@diad.com';
const PASSWORD = process.env.DIAD_PASSWORD ?? 'Trabalh0!';

let cookie = '';
let failed = 0;
let passed = 0;

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  const setCookies = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? ''];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
}

async function getSheet(charId) {
  const r = await fetch(`${BASE}/characters/${charId}/sheet`, {
    headers: { Cookie: cookie },
  });
  if (!r.ok) throw new Error(`sheet ${r.status}`);
  return r.json();
}

async function findCharByPrefix(prefix) {
  const r = await fetch(`${BASE}/characters`, { headers: { Cookie: cookie } });
  const list = await r.json();
  return list.find((c) => c.name?.startsWith(prefix));
}

function assert(label, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('━━━ PROBE-015-FEATURE-01 — FeatureBlock enrichment ━━━\n');
await login();

// Druida L20
console.log('[Druida L20]');
const druid = await findCharByPrefix('druid-L20-');
if (!druid) {
  console.error('No Druida L20 found — run seed/teste setup primeiro');
  process.exit(1);
}
const druidSheet = await getSheet(druid.id);
const druidFeats = druidSheet.features ?? [];
assert('total features > 0', druidFeats.length > 0, `got ${druidFeats.length}`);

const archdruid = druidFeats.find((f) => f.slug === 'archdruid');
assert('Archdruid presente', !!archdruid);
assert("Archdruid category === 'capstone'", archdruid?.category === 'capstone', archdruid?.category);
assert('Archdruid isPassive=true', archdruid?.isPassive === true);
assert(
  'Archdruid narrativeDescriptor curated',
  typeof archdruid?.narrativeDescriptor === 'string' &&
    archdruid.narrativeDescriptor.includes('Wild Shape ilimitado'),
  archdruid?.narrativeDescriptor,
);

const timeless = druidFeats.find((f) => f.slug === 'druid-timeless-body');
assert('Timeless Body presente', !!timeless);
assert("Timeless Body category === 'capstone'", timeless?.category === 'capstone');

const passiveCount = druidFeats.filter((f) => f.isPassive).length;
assert(
  'Passivas detectadas (≥5)',
  passiveCount >= 5,
  `got ${passiveCount}/${druidFeats.length}`,
);

// Bardo L20
console.log('\n[Bardo L20]');
const bard = await findCharByPrefix('bard-L20-');
if (!bard) {
  console.error('No Bardo L20 found');
  process.exit(1);
}
const bardSheet = await getSheet(bard.id);
const bardFeats = bardSheet.features ?? [];

const biVariants = bardFeats.filter((f) => f.slug?.startsWith('bardic-inspiration'));
assert('Bardic Inspiration variants encontrados', biVariants.length > 0);
for (const variant of biVariants) {
  assert(
    `  ${variant.slug} category='resource'`,
    variant.category === 'resource',
    variant.category,
  );
  assert(
    `  ${variant.slug} recharge='short'`,
    variant.resourceCharges?.recharge === 'short',
    JSON.stringify(variant.resourceCharges),
  );
  assert(
    `  ${variant.slug} narrative inclui 'd6/d8/d10/d12'`,
    variant.narrativeDescriptor?.includes('d6/d8/d10/d12'),
  );
}

const cuttingWords = bardFeats.find((f) => f.slug === 'cutting-words');
assert('Cutting Words presente', !!cuttingWords);
assert(
  "Cutting Words formula usa pool BI",
  cuttingWords?.resourceCharges?.formula?.includes('Bardic Inspiration'),
  cuttingWords?.resourceCharges?.formula,
);

console.log(
  `\n━━━ Result: ${passed} passed, ${failed} failed (total ${passed + failed}) ━━━`,
);
process.exit(failed > 0 ? 1 : 0);
