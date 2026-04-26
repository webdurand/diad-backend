// PROBE-013-06 — Spirit Guardians via novo catalog (refactor): aura segue caster.
//
// Cobertura:
//   - tile_effect_created effectKind='spirit-guardians' auraFollowsCaster:true
//   - Mover cleric → snapshot mostra área seguiu (originCell atualiza)
//   - End round → goblin dentro sofre damage via tile_effect_damage_applied triggerKind='on-start-turn-in'
//
// Uso: node tests/probes/013/PROBE-013-06-spirit-guardians-regression.mjs

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

console.log('━━━ PROBE-013-06 — Spirit Guardians regression (catalog-aware) ━━━\n');
await login();

step('[1] Setup: cleric L5 + goblin');
const chars = (await api('/characters')).body ?? [];
const cleric = chars.find((c) => c.name?.startsWith('cleric-L5-')) ??
               chars.find((c) => c.name?.startsWith('cleric-L20-')) ??
               chars.find((c) => c.name?.includes('cleric'));
if (!cleric) { console.error('No cleric'); process.exit(1); }

// Spec 013 — long rest reset pra evitar slot exhaustion entre runs.
await api(`/characters/${cleric.id}/rest`, { method: "POST", body: JSON.stringify({ type: "long" }) }).catch(() => {});

line(`cleric=${cleric.name?.slice(0,24)}`);

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-06-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: cleric.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-06' }),
})).body;
await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 1 }),
});

const snap0 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const clrP = snap0.participants.find((p) => p.type === 'pc');
const gobP = snap0.participants.find((p) => p.type === 'monster');

await api(`/game/encounters/${enc.id}/participants/positions`, {
  method: 'PATCH',
  body: JSON.stringify({
    positions: [
      { participantId: clrP.id, x: 0, y: 0 },
      { participantId: gobP.id, x: 2, y: 0 }, // adjacent — within 15ft aura
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${clrP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Spirit Guardians (self origin, aura)
step('[2] Cast Spirit Guardians');
const cast = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: clrP.id,
    spellSlug: 'spirit-guardians',
    slotLevel: 3,
    targetParticipantIds: [],
  }),
});
line(`cast.ok=${cast.body?.ok} code=${cast.body?.code ?? '-'}`);
assert('cast Spirit Guardians success', cast.body?.ok === true, `code=${cast.body?.code}`);

const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const sg = (snap1?.tileEffects ?? []).find((e) => e.effectKind === 'spirit-guardians');
const auraFollows = sg?.auraFollowsCaster === true;
line(`sg.auraFollowsCaster=${auraFollows} originCell=${JSON.stringify(sg?.originCell)}`);
assert("tileEffects has effectKind='spirit-guardians' auraFollowsCaster:true", !!sg && auraFollows);

// [3] Move cleric → originCell deve seguir
step('[3] Mover cleric (0,0) → (3,3)');
await api(`/game/encounters/${enc.id}/participants/${clrP.id}/position`, {
  method: 'PATCH',
  body: JSON.stringify({ x: 3, y: 3 }),
});
const snap2 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const sg2 = (snap2?.tileEffects ?? []).find((e) => e.effectKind === 'spirit-guardians');
const newOrigin = sg2?.originCell ?? { x: sg2?.originX, y: sg2?.originY };
line(`sg2.originCell=${JSON.stringify(newOrigin)}`);
const followed = (newOrigin?.x === 3 && newOrigin?.y === 3) ||
                 (sg2?.originX === 3 && sg2?.originY === 3);
assert('aura originCell followed cleric to (3,3)', followed, JSON.stringify(newOrigin));

// [4] End turn cleric → next turn (goblin) start should trigger on-start-turn-in damage
step('[4] End cleric turn → goblin start-turn-in damage');
await api(`/game/encounters/${enc.id}/end-turn`, { method: 'POST' }).catch(() => {});
// fallback endpoint: some impls use /next-turn
await api(`/game/encounters/${enc.id}/next-turn`, { method: 'POST' }).catch(() => {});

const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_damage_applied&limit=30`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const startTurnDmgs = events.filter((e) => {
  const tk = e.data?.triggerKind ?? e.payload?.triggerKind;
  return tk === 'on-start-turn-in';
});
line(`damage_applied(on-start-turn-in)=${startTurnDmgs.length}`);
assert('tile_effect_damage_applied(triggerKind=on-start-turn-in) emitted', startTurnDmgs.length >= 1,
  JSON.stringify(events[0]?.data ?? {}).slice(0, 200));

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
