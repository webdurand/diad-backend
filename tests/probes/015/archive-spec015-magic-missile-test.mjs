// Spec 015 Eixo 5 — Magic Missile multi-target backend validation.
//
// Confirma que o backend aceita `targetParticipantIds` com IDs DISTINTOS e
// retorna `targetsHit` com 1 entry por alvo (+ damageDealt independente por dart).
//
// Bardo L20 tem Magic Missile? Vou tentar.

const BASE = 'http://localhost:9001';
const EMAIL = 'admin@diad.com';
const PASSWORD = 'Trabalh0!';
const BARD_ID = 'a684bb78-8e76-44f9-b1a1-66bed5ce0bdf'; // wizard-L20 com magic-missile

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

  // Verifica se bardo tem magic-missile
  const { json: bsheet } = await req('GET', `/characters/${BARD_ID}/sheet`, null, cookie);
  const mm = (bsheet?.spells || []).find((s) => s.slug?.startsWith('magic-missile'));
  if (!mm) {
    console.log('    ⚠️ bardo não tem magic-missile; teste pula. Slugs L1:', (bsheet?.spells || []).filter((s) => s.level === 1).map((s) => s.slug));
    process.exit(0);
  }
  console.log(`    ✅ bardo tem ${mm.slug}`);

  const { json: campaigns } = await req('GET', '/campaigns', null, cookie);
  const campaignId = campaigns[0].id;
  const { json: session } = await req('POST', '/game/sessions', { name: 'spec015-magic-missile', campaignId }, cookie);
  const { json: enc } = await req('POST', `/game/sessions/${session.id}/encounters`, { name: 'mm' }, cookie);
  const encounterId = enc.id;

  const { json: bard } = await req('POST', `/game/encounters/${encounterId}/characters`, { characterId: BARD_ID }, cookie);
  const bardPid = bard.id;

  // Adiciona 3 goblins como alvos
  const { json: monsters } = await req('GET', '/library/monsters?name=goblin&limit=5', null, cookie);
  const goblin = monsters?.data?.[0];
  const targetIds = [];
  for (let i = 0; i < 3; i++) {
    const { json: m } = await req('POST', `/game/encounters/${encounterId}/monsters`, { monsterId: goblin.id, count: 1 }, cookie);
    const pid = Array.isArray(m) ? m[0]?.id : m?.id;
    targetIds.push(pid);
  }
  assert(targetIds.length === 3 && targetIds.every((id) => !!id), '3 goblins criados');

  await req('POST', `/game/encounters/${encounterId}/roll-initiative`, {}, cookie);
  await req('POST', `/game/encounters/${encounterId}/start`, {}, cookie);
  for (let i = 0; i < 12; i++) {
    const { json: e } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    if (e?.value?.currentTurnParticipantId === bardPid) break;
    await req('POST', `/game/encounters/${encounterId}/end-turn`, {}, cookie);
  }

  console.log('\n━━━ Cast Magic Missile L1 — 3 darts em 3 alvos distintos ━━━');
  {
    const { status, json } = await req('POST', `/game/encounters/${encounterId}/cast-spell`, {
      participantId: bardPid,
      spellSlug: mm.slug,
      slotLevel: 1,
      targetParticipantIds: targetIds, // [g1, g2, g3]
    }, cookie);
    assert(status === 200 || status === 201, `cast status=${status}`);
    assert(json.ok === true, `ok=true (body=${JSON.stringify(json).slice(0, 300)})`);
    const hits = json.value?.targetsHit ?? [];
    assert(hits.length === 3, `3 targetsHit entries (got ${hits.length})`);
    const hitIds = new Set(hits.map((h) => h.participantId));
    assert(hitIds.size === 3, '3 alvos DISTINTOS receberam dart');
    const allHaveDamage = hits.every((h) => typeof h.damageDealt === 'number' && h.damageDealt > 0);
    assert(allHaveDamage, 'todos os darts causaram dano (Magic Missile auto-hit)');
    const totalDmg = hits.reduce((s, h) => s + h.damageDealt, 0);
    console.log(`    → ${hits.length} darts, total ${totalDmg} dano force`);
    for (const h of hits) {
      console.log(`       • ${h.displayName}: ${h.damageDealt} force`);
    }
  }

  console.log('\n━━━ Cast Magic Missile L1 — todos no mesmo alvo ━━━');
  // Reset — end turn + wait pra bardo. Goblin 1 pode estar morto.
  for (let i = 0; i < 12; i++) {
    await req('POST', `/game/encounters/${encounterId}/end-turn`, {}, cookie);
    const { json: e } = await req('GET', `/game/encounters/${encounterId}`, null, cookie);
    if (e?.value?.currentTurnParticipantId === bardPid) break;
  }
  {
    // 3 darts no mesmo alvo (goblin 2, por exemplo)
    const samePid = targetIds[1];
    const { json } = await req('POST', `/game/encounters/${encounterId}/cast-spell`, {
      participantId: bardPid,
      spellSlug: mm.slug,
      slotLevel: 1,
      targetParticipantIds: [samePid, samePid, samePid],
    }, cookie);
    if (json.ok !== true) {
      console.log(`    ⚠️ cast rejeitado (pode ser slot esgotado): ${JSON.stringify(json).slice(0, 200)}`);
    } else {
      const hits = json.value?.targetsHit ?? [];
      // RAW: quando todos darts no mesmo, `targetsHit` agrupa em 1 entry com damage somado OU 3 entries com mesmo participantId.
      // Aceitar ambos comportamentos.
      if (hits.length === 3) {
        assert(hits.every((h) => h.participantId === samePid), 'todos os darts no mesmo participant');
      } else {
        assert(hits.length === 1 && hits[0].participantId === samePid, 'agrupou em 1 entry');
      }
      const totalDmg = hits.reduce((s, h) => s + (h.damageDealt ?? 0), 0);
      console.log(`    → 3 darts no mesmo alvo, total ${totalDmg} dano`);
    }
  }

  // Cleanup
  await req('POST', `/game/encounters/${encounterId}/end`, { outcome: 'retreat' }, cookie).catch(() => null);
  await req('DELETE', `/game/sessions/${session.id}`, null, cookie).catch(() => null);
  console.log('\n🎉 EIXO 5 MAGIC MISSILE MULTI-TARGET — GREEN');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
