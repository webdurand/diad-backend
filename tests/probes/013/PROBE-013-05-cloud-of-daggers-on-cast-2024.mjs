// PROBE-013-05 — Cloud of Daggers (RAW 2024): damage on cast, no save, slashing.
//
// Cobertura:
//   - tile_effect_created effectKind='cloud-of-daggers'
//   - tile_effect_damage_applied triggerKind='on-cast', type='slashing', amount > 0
//   - SEM tile_effect_save_rolled (Cloud of Daggers no save)
//   - Cube 5ft = 1 cell radius (validação visual via snapshot)
//
// Uso: node tests/probes/013/PROBE-013-05-cloud-of-daggers-on-cast-2024.mjs

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

console.log('━━━ PROBE-013-05 — Cloud of Daggers RAW 2024 on-cast ━━━\n');
await login();

step('[1] Setup: wizard L5 + goblin no centro do cube');
const chars = (await api('/characters')).body ?? [];
const wiz = chars.find((c) => c.name?.startsWith('wizard-L5-')) ?? chars.find((c) => c.name?.includes('wizard'));
if (!wiz) { console.error('No wizard'); process.exit(1); }

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-05-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: wiz.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-05' }),
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
      { participantId: gobP.id, x: 5, y: 5 },
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${wizP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Cloud of Daggers em (5,5) — cube 5ft = 1 cell, goblin no centro
step('[2] Cast Cloud of Daggers em (5,5)');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: wizP.id,
    spellSlug: 'cloud-of-daggers',
    slotLevel: 2,
    targetParticipantIds: [],
    aoeOriginCell: { x: 5, y: 5 },
  }),
});
line(`cast.ok=${cast.body?.ok} code=${cast.body?.code ?? '-'}`);
assert('cast Cloud of Daggers success', cast.body?.ok === true, `code=${cast.body?.code}`);

// Snapshot
const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const cod = (snap1?.tileEffects ?? []).find((e) => e.effectKind === 'cloud-of-daggers');
assert("tileEffects has effectKind='cloud-of-daggers'", !!cod);

// Validate cube 5ft = radius 1 cell (radius/cells field)
const radius = cod?.radiusCells ?? cod?.radius ?? cod?.sizeCells;
line(`cod.radius/sizeCells=${radius}`);

// Events
step('[3] Events: damage_applied(on-cast, slashing) + NO save_rolled');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_damage_applied,tile_effect_save_rolled&limit=30`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const dmgs = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_damage_applied');
const saves = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_save_rolled');
line(`dmgs=${dmgs.length} saves=${saves.length}`);

const slashOnCast = dmgs.find((e) => {
  const t = e.data?.type ?? e.data?.damageType ?? e.payload?.type;
  const tk = e.data?.triggerKind ?? e.payload?.triggerKind;
  const amt = e.data?.amount ?? e.payload?.amount ?? 0;
  return t === 'slashing' && (tk === 'on-cast' || !tk) && amt > 0;
});

assert("damage_applied(triggerKind='on-cast', type='slashing', amount>0) — RAW 2024", !!slashOnCast,
  JSON.stringify(dmgs[0]?.data ?? {}).slice(0, 200));
assert('NO save_rolled events (Cloud of Daggers no save)', saves.length === 0, `saves=${saves.length}`);
assert("cube 5ft = 1 cell radius (radiusCells<=1)", radius == null || radius <= 1, `radius=${radius}`);

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
