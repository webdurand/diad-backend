// PROBE-013-02 — Spike Growth: damage per cell traversed, no save (RAW 2024).
//
// Cobertura:
//   - tile_effect_created com effectKind='spike-growth'
//   - Move-through dispara múltiplos tile_effect_damage_applied (1 por cell within area)
//   - Soma de damage > 0
//   - SEM tile_effect_save_rolled (RAW: no save, automatic damage)
//
// Uso: node tests/probes/013/PROBE-013-02-spike-growth-damage-per-cell.mjs

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

console.log('━━━ PROBE-013-02 — Spike Growth move-through damage ━━━\n');
await login();

// Setup
step('[1] Setup: druid L5 + goblin');
const chars = (await api('/characters')).body ?? [];
const druid = chars.find((c) => c.name?.startsWith('druid-L5-')) ?? chars.find((c) => c.name?.includes('druid'));
if (!druid) { console.error('No druid'); process.exit(1); }

// Spec 013 — long rest reset pra evitar slot exhaustion entre runs.
await api(`/characters/${druid.id}/rest`, { method: "POST", body: JSON.stringify({ type: "long" }) }).catch(() => {});

line(`druid=${druid.name?.slice(0,24)}`);

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-02-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: druid.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-02' }),
})).body;
await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 1 }),
});

const snap0 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const druidP = snap0.participants.find((p) => p.type === 'pc');
const gobP = snap0.participants.find((p) => p.type === 'monster');

await api(`/game/encounters/${enc.id}/participants/positions`, {
  method: 'PATCH',
  body: JSON.stringify({
    positions: [
      { participantId: druidP.id, x: 5, y: 5 },
      { participantId: gobP.id, x: 0, y: 5 },
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${druidP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Spike Growth no centro (5,5) — sphere radius 4 cells (20ft)
step('[2] Cast Spike Growth em (5,5)');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: druidP.id,
    spellSlug: 'spike-growth',
    slotLevel: 2,
    targetParticipantIds: [],
    aoeOriginCell: { x: 5, y: 5 },
  }),
});
line(`cast.ok=${cast.body?.ok} code=${cast.body?.code ?? '-'}`);
assert('cast Spike Growth success', cast.body?.ok === true, `code=${cast.body?.code}`);

// Snapshot
const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const effects = snap1?.tileEffects ?? [];
const sg = effects.find((e) => e.effectKind === 'spike-growth');
assert("tileEffects has effectKind='spike-growth'", !!sg);

// Goblin (estado inicial em (0,5)) → (10,5): atravessa 11 cells em x=0..10
step('[3] Mover goblin (0,5) → (10,5) atravessando área');
const move = await api(`/game/encounters/${enc.id}/participants/${gobP.id}/position`, {
  method: 'PATCH',
  body: JSON.stringify({ x: 10, y: 5 }),
});
line(`move.status=${move.status}`);

// Events: damage_applied count >= ~6 (cells dentro do raio 4 desde (5,5))
step('[4] Events: tile_effect_damage_applied (per cell)');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_damage_applied,tile_effect_save_rolled&limit=50`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const dmgs = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_damage_applied');
const saves = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_save_rolled');
line(`damageEvents=${dmgs.length} saveEvents=${saves.length}`);

// Filter only Spike Growth damage events (triggerKind=on-move-through)
const sgDmgs = dmgs.filter((e) => {
  const tk = e.data?.triggerKind ?? e.payload?.triggerKind;
  return tk === 'on-move-through' || !tk; // fallback: count all if metadata missing
});
const totalDmg = sgDmgs.reduce((s, e) => s + (e.data?.amount ?? e.payload?.amount ?? 0), 0);
line(`sgDamageEvents=${sgDmgs.length} totalDmg=${totalDmg}`);

assert('multiple damage events (>=6)', sgDmgs.length >= 6, `got ${sgDmgs.length}`);
assert('total damage > 0', totalDmg > 0, `${totalDmg}`);
assert('NO save_rolled events for Spike Growth (RAW: no save)', saves.length === 0, `saves=${saves.length}`);

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
