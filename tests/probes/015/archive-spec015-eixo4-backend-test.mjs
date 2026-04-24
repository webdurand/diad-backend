// Spec 015 Eixo 4 — validação dos endpoints /library/beasts + /revert-transformation
// + handleWildShape com monsterSlug no payload.
//
// Usa o druida L20 (ae82d7c5-bf6c-4df7-96e2-bd3bc353d579) / druid-L20-1776999716318
// Credenciais admin@diad.com / Trabalh0!, backend 9001.

const BASE = 'http://localhost:9001';
const EMAIL = 'admin@diad.com';
const PASSWORD = 'Trabalh0!';
const DRUID_ID = 'ae82d7c5-bf6c-4df7-96e2-bd3bc353d579';

function logPhase(msg) {
  console.log(`\n━━━ ${msg} ━━━`);
}
function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  const setCookie = r.headers.get('set-cookie');
  if (!setCookie) throw new Error('no cookie set');
  const jwt = setCookie.match(/diad_session=([^;]+)/)?.[1];
  if (!jwt) throw new Error('no diad_session cookie');
  return `diad_session=${jwt}`;
}

async function req(method, path, body, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

(async () => {
  const cookie = await login();
  console.log('[auth] logged in');

  // ── PHASE 1: GET /library/beasts (sem guard) ──
  logPhase('PHASE 1 — GET /library/beasts');

  // Sem filtros de numerador → 400
  {
    const { status, json } = await req('GET', '/library/beasts');
    assert(status === 400, '400 sem maxCrNumerator');
    assert(json.code === 'INVALID_CR_FILTER', 'code=INVALID_CR_FILTER');
  }

  // Druid L2: maxCr = 1/4 (3 sem fly/swim)
  {
    const { status, json } = await req(
      'GET',
      '/library/beasts?maxCrNumerator=1&maxCrDenominator=4&excludeFly=true&excludeSwim=true',
    );
    assert(status === 200, '200 CR≤1/4');
    assert(Array.isArray(json.beasts), 'array de beasts');
    assert(json.total === json.beasts.length, 'total consistente');
    const hasFlying = json.beasts.some((b) => b.speed?.fly > 0);
    assert(!hasFlying, 'sem beasts voadoras (excludeFly=true)');
    const hasSwimmers = json.beasts.some((b) => b.speed?.swim > 0);
    assert(!hasSwimmers, 'sem beasts nadadoras (excludeSwim=true)');
    const allUnderCr = json.beasts.every((b) => b.cr <= 0.25);
    assert(allUnderCr, 'todos CR ≤ 0.25');
    console.log(`    → ${json.total} beasts CR ≤ 1/4 (sem fly/swim). Ex.: ${json.beasts.slice(0, 3).map((b) => `${b.name} (CR ${b.cr})`).join(', ')}`);
    const firstBeast = json.beasts[0];
    assert(typeof firstBeast.tacticalSummary === 'string' && firstBeast.tacticalSummary.length > 0, 'tacticalSummary preenchido');
    assert(firstBeast.tacticalSummary.length <= 140, 'tacticalSummary ≤140 chars');
    assert(typeof firstBeast.narrativeDescriptor === 'string' && firstBeast.narrativeDescriptor.length > 0, 'narrativeDescriptor preenchido');
    assert(firstBeast.narrativeDescriptor.length <= 120, 'narrativeDescriptor ≤120 chars');
  }

  // Druid L8: maxCr = 1 (brown bear etc)
  {
    const { status, json } = await req(
      'GET',
      '/library/beasts?maxCrNumerator=1&maxCrDenominator=1',
    );
    assert(status === 200, '200 CR≤1');
    const bear = json.beasts.find((b) => b.slug === 'brown-bear');
    assert(bear != null, 'brown-bear presente');
    if (bear) {
      assert(bear.cr === 1, 'brown-bear CR=1');
      assert(bear.hitPoints === 34, 'brown-bear 34 HP');
      console.log(`    → Brown Bear: HP=${bear.hitPoints}, AC=${bear.armorClass}, tactical="${bear.tacticalSummary}"`);
    }
  }

  // Denominator inválido → 400
  {
    const { status, json } = await req('GET', '/library/beasts?maxCrNumerator=1&maxCrDenominator=3');
    assert(status === 400, '400 denominador=3');
    assert(json.code === 'INVALID_CR_DENOMINATOR', 'code=INVALID_CR_DENOMINATOR');
  }

  // ── PHASE 2: criar encounter + add druida + testar Wild Shape ──
  logPhase('PHASE 2 — criar encounter + Wild Shape RAW');

  // Pegar campanhas do user e criar sessão / encounter
  const { json: campaigns } = await req('GET', '/campaigns', null, cookie);
  assert(Array.isArray(campaigns) && campaigns.length > 0, 'user tem campanhas');
  // Tentar achar campanha onde o druida L20 está
  let campaignId;
  for (const c of campaigns) {
    const { json: joined } = await req('GET', `/campaigns/${c.id}/joined-characters`, null, cookie);
    if (Array.isArray(joined) && joined.some((p) => p.character?.id === DRUID_ID || p.characterId === DRUID_ID)) {
      campaignId = c.id;
      break;
    }
  }
  campaignId ??= campaigns[0].id;
  console.log(`    → campanha: ${campaignId}`);

  // Criar sessão (nested sob campaign)
  const { json: session, status: sStatus } = await req('POST', `/game/sessions`, { name: 'spec-015-eixo4-test', campaignId }, cookie);
  assert(sStatus === 200 || sStatus === 201, `sessão criada (status=${sStatus})`);
  assert(session?.id, 'sessão tem id');
  const sessionId = session.id;
  console.log(`    → session: ${sessionId}`);

  // Criar encounter
  const { json: enc, status: eStatus } = await req('POST', `/game/sessions/${sessionId}/encounters`, { name: 'test-encounter' }, cookie);
  assert(eStatus === 200 || eStatus === 201, `encounter created (status=${eStatus})`);
  assert(enc?.id, 'encounter tem id');
  const encounterId = enc.id;
  console.log(`    → encounter: ${encounterId}`);

  // Add druida como participant
  const { json: addResp, status: aStatus } = await req('POST', `/game/encounters/${encounterId}/characters`, { characterId: DRUID_ID }, cookie);
  console.log(`    → add char status=${aStatus}`);
  assert(addResp?.id, 'druid participant adicionado');
  const druidParticipantId = addResp.id;
  console.log(`    → druida participant: ${druidParticipantId}`);

  // Roll initiative + start encounter. Com 1 PC, druida é current turn.
  await req('POST', `/game/encounters/${encounterId}/roll-initiative`, {}, cookie);
  await req('POST', `/game/encounters/${encounterId}/start`, {}, cookie);
  // Avançar turnos até chegar no druida (pode haver outros PCs auto-adicionados).
  for (let i = 0; i < 10; i++) {
    const { json: encState } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    const cur = encState?.value?.currentTurnParticipantId;
    if (cur === druidParticipantId) break;
    await req('POST', `/game/encounters/${encounterId}/end-turn`, {}, cookie);
  }
  {
    const { json: encState } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    const cur = encState?.value?.currentTurnParticipantId;
    assert(cur === druidParticipantId, `turno é do druida (cur=${cur})`);
  }

  // Wild Shape via class-feature COM monsterSlug
  {
    const { status, json } = await req(
      'POST',
      `/game/encounters/${encounterId}/class-feature`,
      {
        participantId: druidParticipantId,
        featureSlug: 'wild-shape',
        options: { monsterSlug: 'brown-bear' },
      },
      cookie,
    );
    console.log(`    → WS status=${status}, body=${JSON.stringify(json).slice(0, 400)}`);
    assert(status === 200 || status === 201, 'WS endpoint aceita');
    const events = json?.events ?? [];
    const hasEntered = events.some((e) => e.event_type === 'wild_shape_entered' || e.eventType === 'wild_shape_entered');
    assert(hasEntered, 'evento wild_shape_entered emitido');
  }

  // Confirmar transformationState persistido (via GET encounter full)
  {
    const { json: encFull } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    const druid = (encFull?.value?.participants ?? []).find((p) => p.id === druidParticipantId);
    assert(druid?.transformationState != null, 'transformationState presente');
    const form = druid?.transformationState?.form;
    assert(form?.formName?.toLowerCase?.().includes('bear') || form?.monsterSlug === 'brown-bear', 'form é brown-bear');
    console.log(`    → form: ${form?.formName}, maxHp=${form?.maxHp}, ac=${form?.ac}`);
  }

  // ── PHASE 3: revert-transformation ──
  logPhase('PHASE 3 — POST /revert-transformation');

  {
    const { status, json } = await req(
      'POST',
      `/game/encounters/${encounterId}/participants/${druidParticipantId}/revert-transformation`,
      { reason: 'manual' },
      cookie,
    );
    assert(status === 200 || status === 201, 'revert 200');
    assert(json.ok === true, 'ok=true');
    assert(json.reverted === true, 'reverted=true');
    assert(json.formSlugReverted === 'brown-bear', 'formSlugReverted=brown-bear');
    assert(Array.isArray(json.events) && json.events.length > 0, 'events preenchidos');
    const hasReverted = json.events.some((e) => e.eventType === 'transformation_reverted');
    assert(hasReverted, 'event transformation_reverted');
    console.log(`    → hpAfter=${json.hpAfter}, narrative="${json.events[0]?.narrativeDescriptor}"`);
  }

  // Idempotent: segundo revert = reverted:false
  {
    const { status, json } = await req(
      'POST',
      `/game/encounters/${encounterId}/participants/${druidParticipantId}/revert-transformation`,
      { reason: 'manual' },
      cookie,
    );
    assert(status === 200 || status === 201, 'idempotent 200');
    assert(json.ok === true, 'ok=true no-op');
    assert(json.reverted === false, 'reverted=false (no-op)');
  }

  // Concentration-broken reason emit event específico
  {
    // Avança turno pra renovar bonus action; volta pro druida
    for (let i = 0; i < 10; i++) {
      await req('POST', `/game/encounters/${encounterId}/end-turn`, {}, cookie);
      const { json: encState } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
      if (encState?.value?.currentTurnParticipantId === druidParticipantId) break;
    }
    // Re-enter form
    const { json: reWS } = await req('POST', `/game/encounters/${encounterId}/class-feature`, {
      participantId: druidParticipantId,
      featureSlug: 'wild-shape',
      options: { monsterSlug: 'brown-bear' },
    }, cookie);
    if (!reWS?.ok || !reWS?.value?.resolved) {
      console.log(`    reentry WS payload: ${JSON.stringify(reWS).slice(0, 300)}`);
    }

    const { json } = await req(
      'POST',
      `/game/encounters/${encounterId}/participants/${druidParticipantId}/revert-transformation`,
      { reason: 'concentration-broken' },
      cookie,
    );
    assert(json.reverted === true, `reverted=true após reentry (got ${JSON.stringify(json).slice(0, 200)})`);
    const hasConcBroken = json.events.some((e) => e.eventType === 'concentration_broken');
    assert(hasConcBroken, 'event concentration_broken emitido');
  }

  // Cleanup
  await req('POST', `/game/encounters/${encounterId}/end`, { outcome: 'retreat' }, cookie).catch(() => null);
  await req('DELETE', `/game/sessions/${sessionId}`, null, cookie).catch(() => null);

  console.log('\n🎉 EIXO 4 BACKEND — TODOS GREEN');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
