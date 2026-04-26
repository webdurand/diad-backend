// PROBE-013-03 — Wall of Fire: cast em line, dano on-cast em criatura na linha + concentration.
//
// Cobertura:
//   - tile_effect_created com effectKind='wall-of-fire'
//   - tile_effect_save_rolled (DEX) emitido pro goblin
//   - tile_effect_damage_applied com type='fire' triggerKind='on-cast'
//   - Snapshot mostra wizard com isConcentrating:true
//
// Uso: node tests/probes/013/PROBE-013-03-wall-of-fire-damage-on-cast.mjs

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

console.log('━━━ PROBE-013-03 — Wall of Fire on-cast damage + concentration ━━━\n');
await login();

step('[1] Setup: wizard L7 + goblin');
const chars = (await api('/characters')).body ?? [];
const wiz = chars.find((c) => c.name?.startsWith('wizard-L7-')) ??
            chars.find((c) => c.name?.startsWith('wizard-L20-')) ??
            chars.find((c) => c.name?.includes('wizard'));
if (!wiz) { console.error('No wizard'); process.exit(1); }

// Spec 013 — long rest reset pra evitar slot exhaustion entre runs.
await api(`/characters/${wiz.id}/rest`, { method: "POST", body: JSON.stringify({ type: "long" }) }).catch(() => {});

line(`wizard=${wiz.name?.slice(0,24)}`);

const lib = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (lib?.items ?? lib?.data ?? [])[0];
if (!goblin) { console.error('No goblin'); process.exit(1); }

const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-013-03-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: wiz.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-013-03' }),
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

// Cast Wall of Fire em (5,5) — line cobre o goblin
step('[2] Cast Wall of Fire em (5,5)');
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
line(`cast.ok=${cast.body?.ok} code=${cast.body?.code ?? '-'}`);
assert('cast Wall of Fire success', cast.body?.ok === true, `code=${cast.body?.code}`);

// Snapshot tem effectKind='wall-of-fire'
step('[3] Snapshot.tileEffects + concentration');
const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const effects = snap1?.tileEffects ?? [];
const wof = effects.find((e) => e.effectKind === 'wall-of-fire');
assert("tileEffects has effectKind='wall-of-fire'", !!wof);

const wizNow = snap1.participants.find((p) => p.id === wizP.id);
const isConc = wizNow?.isConcentrating === true ||
               wizNow?.concentratingOn != null ||
               wizNow?.concentration?.spellSlug === 'wall-of-fire';
line(`wizard isConcentrating=${isConc}`);
assert('wizard isConcentrating=true after cast', isConc);

// Events
step('[4] Events: save_rolled + damage_applied(on-cast, fire)');
const evtsRes = await api(`/game/encounters/${enc.id}/events?type=tile_effect_save_rolled,tile_effect_damage_applied&limit=30`);
const events = evtsRes.body?.value?.events ?? evtsRes.body?.events ?? evtsRes.body?.items ?? [];
const saves = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_save_rolled');
const dmgs = events.filter((e) => (e.eventType ?? e.event_type) === 'tile_effect_damage_applied');
line(`saves=${saves.length} dmgs=${dmgs.length}`);

const dexSave = saves.find((e) => {
  const ab = e.data?.ability ?? e.payload?.ability;
  return ab === 'dex' || ab === 'DEX' || ab === 'dexterity';
});
const fireDmg = dmgs.find((e) => {
  const t = e.data?.type ?? e.data?.damageType ?? e.payload?.type;
  const tk = e.data?.triggerKind ?? e.payload?.triggerKind;
  return t === 'fire' && (tk === 'on-cast' || !tk);
});

assert('tile_effect_save_rolled (DEX) emitted', !!dexSave, JSON.stringify(saves[0]?.data ?? {}).slice(0, 200));
assert("tile_effect_damage_applied(type='fire', triggerKind='on-cast')", !!fireDmg, JSON.stringify(dmgs[0]?.data ?? {}).slice(0, 200));

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
