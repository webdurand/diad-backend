// Spec 015 Eixo 2 — Teste end-to-end de Produce Flame (self-origin-attack).
// Cria setup fresh (session+encounter+druida+2 goblins), executa 3 casts, reporta, cleanup.

const BASE = 'http://localhost:9001';
const EMAIL = 'admin@diad.com';
const PASSWORD = 'Trabalh0!';
const DRUID_NAME_PREFIX = 'druid-L20-';

let cookie = '';

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
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
}

function step(label) { console.log(`\n━━━ ${label}`); }
function line(...a) { console.log('  ' + a.join(' ')); }

await login();
line('logged in as admin@diad.com');

// 1. Druida
step('[1] Escolher druida');
const chars = (await api('/characters')).body ?? [];
const druids = chars.filter((c) => typeof c.name === 'string' && c.name.startsWith(DRUID_NAME_PREFIX))
  .sort((a, b) => (a.name < b.name ? 1 : -1));
const druid = druids[0];
if (!druid) { console.error('No druid found'); process.exit(1); }
line(`druid=${druid.id.slice(0, 8)} (${druid.name})`);

// 1.5. Garantir que druida tem Produce Flame
step('[1.5] Conferir spells do druida');
const sheet = (await api(`/characters/${druid.id}/sheet`)).body;
const spells = sheet?.spells ?? sheet?.knownSpells ?? sheet?.preparedSpells ?? [];
const hasProduceFlame =
  Array.isArray(spells) &&
  spells.some((s) => (s.slug ?? s.spellSlug ?? '').includes('produce-flame')) ||
  JSON.stringify(sheet).includes('produce-flame');
line(`produce-flame present in sheet=${hasProduceFlame}`);

// 2. Monstro
step('[2] Pegar monsterId do goblin');
const lib = await api('/library/monsters?name=goblin&limit=10');
const goblinData = (lib.body?.data ?? []).find((m) => (m.slug ?? m.name ?? '').toLowerCase() === 'goblin');
if (!goblinData) {
  line('not found by exact slug, dumping first match:', JSON.stringify((lib.body?.data ?? [])[0]));
}
const goblin = goblinData ?? (lib.body?.data ?? [])[0];
if (!goblin) { console.error('No monster found'); process.exit(1); }
line(`goblin=${goblin.id} slug=${goblin.slug}`);

// 3. Session
step('[3] Criar session');
const sessionRes = await api('/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: `Solo: spec015-test-${Date.now()}` }),
});
const session = sessionRes.body;
if (!session?.id) { console.error('Failed to create session:', sessionRes); process.exit(1); }
line(`session=${session.id.slice(0, 8)}`);

// 4. Adicionar druida à sessão
step('[4] Adicionar druida à session');
const addSessRes = await api(`/game/sessions/${session.id}/characters`, {
  method: 'POST',
  body: JSON.stringify({ characterId: druid.id }),
});
line(`add-sess status=${addSessRes.status}`);

// 5. Criar encounter
step('[5] Criar encounter');
const encRes = await api(`/game/sessions/${session.id}/encounters`, {
  method: 'POST',
  body: JSON.stringify({ name: 'spec015-encounter' }),
});
const enc = encRes.body;
if (!enc?.id) { console.error('Failed to create encounter:', encRes); process.exit(1); }
line(`encounter=${enc.id.slice(0, 8)} status=${enc.status}`);

// 6. Druida já foi adicionado automaticamente pela sessão — skip /characters.
// 7. Adicionar 2 goblins
step('[7] Add 2 goblins ao encounter');
const monRes = await api(`/game/encounters/${enc.id}/monsters`, {
  method: 'POST',
  body: JSON.stringify({ monsterId: goblin.id, count: 2 }),
});
line(`add-monsters status=${monRes.status}`);

// 8. Snapshot — shape é GameResult<EncounterSnapshot>: body.value.participants
step('[8] Snapshot inicial');
const snap1raw = (await api(`/game/encounters/${enc.id}/snapshot`)).body;
const snap1 = snap1raw?.value ?? snap1raw;
const parts = snap1?.participants ?? [];
line(`snapshot participants=${parts.length}`);
const druidPart = parts.find((p) => p.type === 'pc');
const goblinParts = parts.filter((p) => p.type === 'monster');
line(`druidParticipant=${druidPart?.id?.slice(0, 8)} (${druidPart?.displayName})`);
line(`goblinParticipants=${goblinParts.map((g) => g.id.slice(0, 8)).join(', ')}`);

if (!druidPart || goblinParts.length < 2) {
  console.error('Setup incomplete'); process.exit(1);
}

// 9. Posicionar: druida (0,0), goblin[0] (2,2)=10ft, goblin[1] (10,10)=50ft
step('[9] Posicionar tokens');
const posRes = await api(`/game/encounters/${enc.id}/participants/positions`, {
  method: 'PATCH',
  body: JSON.stringify({
    positions: [
      { participantId: druidPart.id, x: 0, y: 0 },
      { participantId: goblinParts[0].id, x: 2, y: 2 }, // 10ft
      { participantId: goblinParts[1].id, x: 10, y: 10 }, // 50ft
    ],
  }),
});
line(`patch-positions status=${posRes.status}`);

// 10. Roll initiative
step('[10] Roll initiative');
const initRes = await api(`/game/encounters/${enc.id}/roll-initiative`, { method: 'POST' });
line(`roll-init status=${initRes.status}`);

// 11. Forçar druida no topo do turn order
step('[11] Set druida init=99 (garantir ser primeiro)');
const setInitRes = await api(`/game/encounters/${enc.id}/initiative/${druidPart.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ total: 99 }),
});
line(`set-init status=${setInitRes.status}`);

// 12. Start
step('[12] Start combat');
const startRes = await api(`/game/encounters/${enc.id}/start`, { method: 'POST' });
line(`start status=${startRes.status}`);

// 13. Confirmar que é turno do druida
const snap2raw = (await api(`/game/encounters/${enc.id}/snapshot`)).body;
const snap2 = snap2raw?.value ?? snap2raw;
const currentPid = snap2?.currentTurnParticipantId;
line(`turno atual=${currentPid?.slice(0, 8)} druida=${druidPart.id.slice(0, 8)} match=${currentPid === druidPart.id}`);

if (currentPid !== druidPart.id) {
  line('⚠️ não é turno do druida — abortando');
  process.exit(1);
}

// ====== TESTES DO FIX ======

step('[TEST 1] Produce Flame em self → esperar 400 INVALID_TARGET_SELF');
const t1 = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    spellSlug: 'produce-flame',
    participantId: druidPart.id,
    slotLevel: 0,
    targetParticipantIds: [druidPart.id],
  }),
});
line(`status=${t1.status}`);
line(`body=${JSON.stringify(t1.body)}`);

step('[TEST 2] Produce Flame em goblin 10ft → esperar 200 OK');
const t2 = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    spellSlug: 'produce-flame',
    participantId: druidPart.id,
    slotLevel: 0,
    targetParticipantIds: [goblinParts[0].id],
  }),
});
line(`status=${t2.status}`);
line(`body=${JSON.stringify(t2.body).slice(0, 400)}`);

step('[TEST 3] Produce Flame em goblin 50ft → esperar 400 SPELL_OUT_OF_RANGE');
const t3 = await api(`/game/encounters/${enc.id}/cast-spell`, {
  method: 'POST',
  body: JSON.stringify({
    spellSlug: 'produce-flame',
    participantId: druidPart.id,
    slotLevel: 0,
    targetParticipantIds: [goblinParts[1].id],
  }),
});
line(`status=${t3.status}`);
line(`body=${JSON.stringify(t3.body)}`);

// ====== VERDITO ======
// DIAD usa pattern {ok: boolean, code?, value?, error?} em payloads de POST — HTTP 201 é status default.
// Sucesso/falha é checado em body.ok; code indica tipo de erro.
step('═══ VERDITO ═══');
function check(label, actual, expectOk, expectCode) {
  const bodyOk = actual.body?.ok;
  const code = actual.body?.code ?? actual.body?.error?.code;
  const okMatch = bodyOk === expectOk;
  const codeMatch = expectCode ? code === expectCode : true;
  const mark = okMatch && codeMatch ? '✅' : '❌';
  console.log(`${mark} ${label}: ok=${bodyOk}(exp ${expectOk}) code=${code ?? '-'}(exp ${expectCode ?? '-'})`);
  return okMatch && codeMatch;
}
const r1 = check('TEST 1 (self reject)', t1, false, 'INVALID_TARGET_SELF');
const r2 = check('TEST 2 (10ft hit)', t2, true, null);
const r3 = check('TEST 3 (50ft out)', t3, false, 'SPELL_OUT_OF_RANGE');

// Extra: assert RAW damage
if (r2 && t2.body?.value?.damage) {
  const d = t2.body.value.damage;
  console.log(`   → Produce Flame L20 druida hit: ${d.expression}=${d.total} ${d.type}`);
}
const overall = r1 && r2 && r3;

// Cleanup: deletar encounter + session pra não poluir
step('[cleanup] DELETE session');
await api(`/game/sessions/${session.id}`, { method: 'DELETE' });

console.log(`\n${overall ? '✅ ALL PASS' : '❌ FAILURES'}`);
process.exit(overall ? 0 : 1);
