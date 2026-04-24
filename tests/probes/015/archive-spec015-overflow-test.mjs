// Spec 015 Eixo 4 — Overflow damage RAW 2024.
//
// Fluxo:
// 1. Druida L20 cast Wild Shape → Brown Bear (34 HP)
// 2. Aplica damage 50 no druida-in-form
// 3. RAW 2024: HP da forma vai a 0 → auto-revert; excesso (50-34=16) vai pro HP do PC
// 4. Valida: transformationState=null, caster HP diminuiu em 16

const BASE = 'http://localhost:9001';
const EMAIL = 'admin@diad.com';
const PASSWORD = 'Trabalh0!';
const DRUID_ID = 'ae82d7c5-bf6c-4df7-96e2-bd3bc353d579';

function assert(cond, msg) {
  if (!cond) { console.error(`❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`✅ ${msg}`);
}

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const jwt = r.headers.get('set-cookie')?.match(/diad_session=([^;]+)/)?.[1];
  return `diad_session=${jwt}`;
}

async function req(method, path, body, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

(async () => {
  const cookie = await login();
  console.log('[auth] logged in');

  const { json: campaigns } = await req('GET', '/campaigns', null, cookie);
  const campaignId = campaigns[0].id;
  const { json: session } = await req('POST', '/game/sessions', { name: 'spec015-overflow', campaignId }, cookie);
  const { json: enc } = await req('POST', `/game/sessions/${session.id}/encounters`, { name: 'overflow' }, cookie);
  const encounterId = enc.id;

  const { json: druid } = await req('POST', `/game/encounters/${encounterId}/characters`, { characterId: DRUID_ID }, cookie);
  const druidPid = druid.id;

  await req('POST', `/game/encounters/${encounterId}/roll-initiative`, {}, cookie);
  await req('POST', `/game/encounters/${encounterId}/start`, {}, cookie);
  for (let i = 0; i < 12; i++) {
    const { json: e } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    if (e?.value?.currentTurnParticipantId === druidPid) break;
    await req('POST', `/game/encounters/${encounterId}/end-turn`, {}, cookie);
  }

  // Capturar HP original do druida
  const { json: before } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
  const druidBefore = before?.value?.participants?.find((p) => p.id === druidPid);
  const originalHp = druidBefore?.currentHp;
  assert(typeof originalHp === 'number' && originalHp > 0, `druida HP original lido: ${originalHp}`);

  // Cast Wild Shape → Brown Bear (34 HP)
  const { json: ws } = await req('POST', `/game/encounters/${encounterId}/class-feature`, {
    participantId: druidPid,
    featureSlug: 'wild-shape',
    options: { monsterSlug: 'brown-bear' },
  }, cookie);
  assert(ws?.ok && ws?.value?.resolved, 'Wild Shape → Brown Bear aplicado');

  // Confirma form com 34 HP (default brown bear)
  const { json: afterWS } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
  const druidInForm = afterWS?.value?.participants?.find((p) => p.id === druidPid);
  const formMaxHp = druidInForm?.transformationState?.form?.maxHp;
  assert(formMaxHp === 34, `brown bear form maxHp=34 (got ${formMaxHp})`);

  // Aplica damage 50 (34 absorbido + 16 overflow)
  console.log('\n━━━ Aplica 50 dano no druida-em-forma ━━━');
  const { json: dmg } = await req('POST', `/game/encounters/${encounterId}/damage`, {
    targetParticipantId: druidPid,
    amount: 50,
    damageType: 'bludgeoning',
  }, cookie);
  console.log(`    damage result: ${JSON.stringify(dmg).slice(0, 300)}`);
  assert(dmg?.ok !== false, 'damage endpoint aceitou');

  // Verifica revert + overflow
  const { json: after } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
  const druidAfter = after?.value?.participants?.find((p) => p.id === druidPid);
  console.log(`    state após damage: transformationState=${druidAfter?.transformationState ? 'presente' : 'null'}, HP=${druidAfter?.currentHp}`);

  if (druidAfter?.transformationState == null) {
    // Revertido. Overflow = 50 - 34 = 16. Druida HP deveria = originalHp - 16.
    const expectedHp = originalHp - 16;
    assert(druidAfter.currentHp === expectedHp, `overflow aplicado ao caster (HP=${druidAfter.currentHp} vs esperado ${expectedHp})`);
    console.log(`    ✅ overflow 16 aplicado ao caster corretamente`);
  } else {
    // Não revertido — pode ser bug ou comportamento esperado se form ainda tem HP
    const formHp = druidAfter.transformationState?.form?.currentHp;
    console.log(`    ⚠️ ainda em forma — form HP=${formHp}/${formMaxHp}`);
    assert(false, 'form deveria ter revertido (50 dano > 34 HP)');
  }

  // Cleanup
  await req('POST', `/game/encounters/${encounterId}/end`, { outcome: 'retreat' }, cookie).catch(() => null);
  await req('DELETE', `/game/sessions/${session.id}`, null, cookie).catch(() => null);
  console.log('\n🎉 OVERFLOW DAMAGE RAW 2024 — GREEN');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
