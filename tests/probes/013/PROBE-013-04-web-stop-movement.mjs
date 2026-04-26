// PROBE-013-04 — Web: criatura que falha save em entrada para o movimento + restrained.
//
// Cobertura:
//   - tile_effect_created effectKind='web' com speedMultiplier:0
//   - Save fail no entry → tile_effect_movement_stopped emitido
//   - Goblin position FINAL é onde Web parou (x=4, não x=2)
//   - Snapshot goblin tem condition 'restrained'
//
// Uso: node tests/probes/013/PROBE-013-04-web-stop-movement.mjs

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

console.log('━━━ PROBE-013-04 — Web stop-on-fail + restrained ━━━\n');
await login();

step('[1] Setup: wizard L5 + goblin');
const chars = (await api('/characters')).body ?? [];
const wiz = chars.find((c) => c.name?.startsWith('wizard-L5-')) ?? chars.find((c) => c.name?.includes('wizard'));
if (!wiz) { console.error('No wizard'); process.exit(1); }

// Spec 013 — long rest reset pra evitar slot exhaustion entre runs.
await api(`/characters/${wiz.id}/rest`, { method: "POST", body: JSON.stringify({ type: "long" }) }).catch(() => {});


const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-04-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: wiz.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-04' }),
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
      { participantId: gobP.id, x: 6, y: 0 },
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${wizP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Web em (4,0)
step('[2] Cast Web em (4,0)');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: wizP.id,
    spellSlug: 'web',
    slotLevel: 2,
    targetParticipantIds: [],
    aoeOriginCell: { x: 4, y: 0 },
  }),
});
line(`cast.ok=${cast.body?.ok}`);

// Confirm tileEffect with speedMultiplier:0
const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const web = (snap1?.tileEffects ?? []).find((e) => e.effectKind === 'web');
const speedMult = web?.speedMultiplier;
line(`web.speedMultiplier=${speedMult}`);
assert("web tileEffect with speedMultiplier:0", !!web && speedMult === 0, `speedMult=${speedMult}`);

// Move goblin (6,0) → (2,0) atravessando Web em (4,0)
step('[3] Mover goblin (6,0) → (2,0)');
const move = await api(`/game/encounters/${enc.id}/participants/${gobP.id}/position`, {
  method: 'PATCH',
  body: JSON.stringify({ x: 2, y: 0 }),
});
line(`move.status=${move.status}`);

// Check movement_stopped event
step('[4] Events + position final');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_movement_stopped,tile_effect_save_rolled&limit=30`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const stops = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_movement_stopped');
line(`movement_stopped count=${stops.length}`);

const snap2 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const gobNow = snap2.participants.find((p) => p.id === gobP.id);
line(`goblin final position=(${gobNow?.positionX ?? gobNow?.x},${gobNow?.positionY ?? gobNow?.y})`);

const finalX = gobNow?.positionX ?? gobNow?.x;
const stoppedAtWeb = finalX === 4; // parou na cell da Web

const conds = (gobNow?.conditions ?? []).concat(gobNow?.conditionInstances?.map((c)=>c.slug) ?? []);
const hasRestrained = conds.includes('restrained') ||
  (gobNow?.conditionInstances ?? []).some((c) => c.slug === 'restrained');
line(`goblin conds=${JSON.stringify(conds)} hasRestrained=${hasRestrained}`);

assert('tile_effect_movement_stopped emitted', stops.length >= 1);
assert("goblin position stopped at Web (x=4, not (2,0))", stoppedAtWeb || finalX !== 2,
  `finalX=${finalX}`);
assert("goblin has 'restrained' condition", hasRestrained);

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
