// PROBE-013-07 — Concentration break em Wall of Fire → cascade remove área.
//
// Cobertura:
//   - tile_effect_concentration_broken event emitido (catalog-aware)
//   - Snapshot.tileEffects[] vazia (área removida pela cascata)
//   - Wizard isConcentrating:false após break
//
// Uso: node tests/probes/013/PROBE-013-07-concentration-break-cascade.mjs

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

async function api(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
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

const step = (l) => console.log(`\n━━━ ${l}`);
const line = (...a) => console.log('  ' + a.join(' '));

console.log('━━━ PROBE-013-07 — Concentration break cascade ━━━\n');
await login();

step('[1] Setup: wizard L7 + goblin');
const chars = (await api('/characters')).body ?? [];
const wiz = chars.find((c) => c.name?.startsWith('wizard-L7-')) ??
            chars.find((c) => c.name?.startsWith('wizard-L20-')) ??
            chars.find((c) => c.name?.includes('wizard'));
if (!wiz) { console.error('No wizard'); process.exit(1); }

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-07-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: wiz.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-07' }),
})).body;
await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 1 }),
});

const snap0 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const wizP = snap0.participants.find((p) => p.type === 'pc');
const gobP = snap0.participants.find((p) => p.type === 'monster');

await api(`/game/encounters/${enc.id}/participants/positions`, {
  method: 'PATCH',
  body: JSON.stringify({
    positions: [
      { participantId: wizP.id, x: 0, y: 0 },
      { participantId: gobP.id, x: 8, y: 8 },
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${wizP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Wall of Fire (concentration spell)
step('[2] Cast Wall of Fire (concentration)');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: wizP.id,
    spellSlug: 'wall-of-fire',
    slotLevel: 4,
    targetParticipantIds: [],
    aoeOriginCell: { x: 5, y: 5 },
  }),
});
line(`cast.ok=${cast.body?.ok}`);

const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const beforeEffects = snap1?.tileEffects ?? [];
const wof = beforeEffects.find((e) => e.effectKind === 'wall-of-fire');
line(`pre-break tileEffects=${beforeEffects.length} wall=${!!wof}`);

// [3] Forçar concentration break: aplicar damage massivo no wizard até quebrar concentration
step('[3] Damage wizard pra forçar concentration break');
let broke = false;
for (let i = 0; i < 5 && !broke; i++) {
  const dmg = await api(`/game/encounters/${enc.id}/damage`, {
    method: 'POST',
    body: JSON.stringify({
      targetParticipantId: wizP.id,
      amount: 100,
      damageType: 'necrotic',
    }),
  });
  const evts = dmg.body?.events ?? dmg.body?.value?.events ?? [];
  const types = evts.map((e) => e.eventType ?? e.event_type);
  if (types.includes('concentration_broken') || types.includes('tile_effect_concentration_broken')) {
    broke = true;
  }
  line(`damage iter ${i+1}: events=${types.join(',')}`);
}

// Fetch all events to validate cascade
step('[4] Validate concentration_broken + cascade');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_concentration_broken,persistent_area_removed&limit=30`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const concBroken = events.filter((e) =>
  (e.eventType ?? e.event_type) === 'tile_effect_concentration_broken' ||
  (e.eventType ?? e.event_type) === 'persistent_area_removed'
);
line(`concentration_broken events=${concBroken.length}`);

const snap2 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const afterEffects = snap2?.tileEffects ?? [];
const wofAfter = afterEffects.find((e) => e.effectKind === 'wall-of-fire');
line(`post-break tileEffects=${afterEffects.length} wall=${!!wofAfter}`);

const wizAfter = snap2.participants.find((p) => p.id === wizP.id);
const stillConc = wizAfter?.isConcentrating === true ||
                  wizAfter?.concentratingOn != null ||
                  wizAfter?.concentration?.spellSlug === 'wall-of-fire';
line(`wizard isConcentrating after=${stillConc}`);

assert('tile_effect_concentration_broken (or persistent_area_removed) emitted', concBroken.length >= 1);
assert('snapshot.tileEffects no longer has wall-of-fire (cascade removed)', !wofAfter);
assert('wizard.isConcentrating === false', !stillConc);

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
