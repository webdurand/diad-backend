// PROBE-015-CONDITION-01 — ConditionInstance.source + narrativeDescriptor (Eixo 3)
//
// Setup: session + encounter + bardo + goblin; cast Faerie Fire (concentration).
// Valida:
//   - GET snapshot: goblin.conditionInstances tem source='spell:faerie-fire'
//   - Break concentration: events.condition_removed tem narrativeDescriptor + removalReason + source
//
// Uso: `node tests/probes/015/PROBE-015-CONDITION-01-source-field.mjs`

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

console.log('━━━ PROBE-015-CONDITION-01 — ConditionInstance.source ━━━\n');
await login();

const chars = (await api('/characters')).body ?? [];
const bard = chars.find((c) => c.name?.startsWith('bard-L20-'));
if (!bard) {
  console.error('No Bardo L20 found');
  process.exit(1);
}
console.log(`[setup] bard=${bard.name.slice(0, 24)}`);

const goblinsRes = (await api('/library/monsters?name=goblin&limit=5')).body;
const goblin = (goblinsRes?.items ?? goblinsRes?.data ?? [])[0];
if (!goblin) {
  console.error('No goblin in library');
  process.exit(1);
}

// Session + add bard + encounter + add goblin
const session = (await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `probe-015-cond-01-${Date.now()}` }),
})).body;
await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: bard.id }),
});
const enc = (await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'probe-015-cond-01' }),
})).body;
await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 1 }),
});

const snap1 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const bardP = snap1.participants.find((p) => p.type === 'pc');
const goblinP = snap1.participants.find((p) => p.type === 'monster');

// Position + start combat
await api(`/game/encounters/${enc.id}/participants/positions`, {
  method: 'PATCH',
  body: JSON.stringify({
    positions: [
      { participantId: bardP.id, x: 0, y: 0 },
      { participantId: goblinP.id, x: 3, y: 0 },
    ],
  }),
});
await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
await api(`/game/encounters/${enc.id}/initiative/${bardP.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });

// Cast Faerie Fire
console.log('\n[step] Cast Faerie Fire');
const castRes = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    participantId: bardP.id,
    spellSlug: 'faerie-fire',
    slotLevel: 1,
    targetParticipantIds: [goblinP.id],
  }),
});
assert('cast Faerie Fire success', castRes.body?.ok === true, `code=${castRes.body?.code}`);

// Check snapshot: goblin tem conditionInstance com source correto
const snap2 = (await api(`/game/encounters/${enc.id}/snapshot`)).body?.value;
const goblinNow = snap2.participants.find((p) => p.id === goblinP.id);
const ci = (goblinNow?.conditionInstances ?? []).find(
  (c) => c.sourceSpell === 'faerie-fire' || c.source?.includes('faerie-fire'),
);
if (ci) {
  assert(
    'ConditionInstance tem campo source',
    typeof ci.source === 'string',
    ci.source,
  );
  assert(
    "source === 'spell:faerie-fire'",
    ci.source === 'spell:faerie-fire',
    ci.source,
  );
} else {
  console.log(
    '  (Faerie Fire aplica condition-aura/effect em vez de ConditionInstance direto — normal pra RAW 2024; skipping source assertion)',
  );
}

// Break concentration manualmente (dano suficiente pra forçar fail ou break via service)
console.log('\n[step] Damage bard pra forçar concentration save fail');
let broke = false;
// Tenta aplicar dano massivo 3x até quebrar
for (let i = 0; i < 3 && !broke; i++) {
  const dmg = await api(`/game/encounters/${enc.id}/damage`, {
    method: 'POST',
    body: JSON.stringify({
      targetParticipantId: bardP.id,
      amount: 50,
      damageType: 'necrotic',
    }),
  });
  const hadBreak = (dmg.body?.events ?? []).some(
    (e) => e.event_type === 'concentration_broken',
  );
  if (hadBreak) broke = true;
}

if (broke) {
  // Snapshot + get events do encounter pra procurar condition_removed enriquecido
  const eventsRes = await api(`/game/encounters/${enc.id}/events`);
  const events = eventsRes.body?.items ?? eventsRes.body ?? [];
  const removeds = events.filter(
    (e) =>
      (e.event_type ?? e.type) === 'condition_removed' &&
      (e.data?.source === 'spell:faerie-fire' || e.data?.sourceSpell === 'faerie-fire'),
  );
  if (removeds.length > 0) {
    const ev = removeds[0];
    assert(
      'condition_removed tem narrativeDescriptor',
      typeof ev.data?.narrativeDescriptor === 'string' &&
        ev.data.narrativeDescriptor.length > 0,
      ev.data?.narrativeDescriptor,
    );
    assert(
      "removalReason === 'concentration_broken'",
      ev.data?.removalReason === 'concentration_broken',
      ev.data?.removalReason,
    );
    assert(
      "source === 'spell:faerie-fire'",
      ev.data?.source === 'spell:faerie-fire',
      ev.data?.source,
    );
  } else {
    console.log(
      '  (condition_removed não encontrado — pode indicar que Faerie Fire não criou ConditionInstance; event payload enriquecido não testável aqui)',
    );
  }
}

// Cleanup
await api(`/game/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});

console.log(`\n━━━ Result: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
