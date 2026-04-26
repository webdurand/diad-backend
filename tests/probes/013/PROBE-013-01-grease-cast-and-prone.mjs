// PROBE-013-01 — Grease cast cria tile-effect; goblin que entra falha save → prone.
//
// Cobertura:
//   - tile_effect_created emitido (via /events filter)
//   - snapshot.tileEffects[] tem entry com effectKind='grease'
//   - Movimentação do goblin pra cell de Grease dispara tile_effect_save_rolled (DEX)
//   - Save fail → tile_effect_condition_applied (slug='prone')
//
// Uso: node tests/probes/013/PROBE-013-01-grease-cast-and-prone.mjs

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

console.log('━━━ PROBE-013-01 — Grease cast & prone on entry ━━━\n');
await login();

// [1] Setup
step('[1] Setup: wizard L5 + goblin');
const chars = (await api('/characters')).body ?? [];
const wiz = chars.find((c) => c.name?.startsWith('wizard-L5-')) ?? chars.find((c) => c.name?.includes('wizard'));
if (!wiz) { console.error('No wizard found'); process.exit(1); }
line(`wizard=${wiz.name?.slice(0, 24)}`);

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-01-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: wiz.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-01' }),
})).body;
await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 1 }),
});

const snap0 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const wizP = snap0.participants.find((p) => p.type === 'pc');
const gobP = snap0.participants.find((p) => p.type === 'monster');
line(`wizP=${wizP.id.slice(0,8)} gobP=${gobP.id.slice(0,8)}`);

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

// [2] Cast Grease em (4,0)
step('[2] Cast Grease em (4,0)');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: wizP.id,
    spellSlug: 'grease',
    slotLevel: 1,
    targetParticipantIds: [],
    aoeOriginCell: { x: 4, y: 0 },
  }),
});
line(`cast.ok=${cast.body?.ok} code=${cast.body?.code ?? '-'}`);
assert('cast Grease success', cast.body?.ok === true, `code=${cast.body?.code}`);

// [3] Snapshot tem tileEffects[] com effectKind='grease'
step('[3] Snapshot.tileEffects');
const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const effects = snap1?.tileEffects ?? [];
line(`tileEffects=${effects.length} kinds=${effects.map((e)=>e.effectKind).join(',')}`);
const grease = effects.find((e) => e.effectKind === 'grease');
assert("snapshot.tileEffects has effectKind='grease'", !!grease, JSON.stringify(effects[0] ?? {}).slice(0, 200));

// [4] Validate tile_effect_created event
step('[4] Events: tile_effect_created');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_created`);
const events1 = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
line(`tile_effect_created count=${events1.length}`);
assert('tile_effect_created emitted', events1.length >= 1);

// [5] Mover goblin para (4,0) — entra na Grease
step('[5] Mover goblin (6,0) → (4,0)');
const move = await api(`/game/encounters/${enc.id}/participants/${gobP.id}/position`, {
  method: 'PATCH',
  body: JSON.stringify({ x: 4, y: 0 }),
});
line(`move.status=${move.status}`);

// [6] Validate save_rolled + condition_applied
step('[6] Events pós-movimento');
const evts2Res = await api(`/game/encounters/${enc.id}/events?type=tile_effect_save_rolled,tile_effect_condition_applied&limit=50`);
const evts2 = evts2Res.body?.value?.events ?? evts2Res.body?.events ?? evts2Res.body?.items ?? [];
const saves = evts2.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_save_rolled');
const conds = evts2.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_condition_applied');
line(`saves=${saves.length} conds=${conds.length}`);

const proneCond = conds.find((e) => {
  const slug = e.data?.conditionSlug ?? e.payload?.conditionSlug;
  return slug === 'prone';
});

// Ensure goblin's condition list has prone (snapshot reflexivo)
const snap2 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const gobNow = snap2.participants.find((p) => p.id === gobP.id);
const gobConds = (gobNow?.conditions ?? []).concat(gobNow?.conditionInstances?.map((c)=>c.slug) ?? []);
const hasProne = gobConds.includes('prone') || (gobNow?.conditionInstances ?? []).some((c) => c.slug === 'prone');
line(`goblin conditions=${JSON.stringify(gobConds)} hasProne=${hasProne}`);

// Save pode passar — o probe valida quando falha; se passou, ainda registra evento mas sem prone.
// Aceita-se OR: condition_applied(prone) OU goblin.conditions inclui prone.
assert('tile_effect_save_rolled emitted (DEX)', saves.length >= 1, JSON.stringify(saves[0]?.data ?? {}).slice(0, 200));
assert(
  "prone applied (event or snapshot)",
  !!proneCond || hasProne,
  `proneEvt=${!!proneCond} hasProneSnap=${hasProne}`,
);

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
