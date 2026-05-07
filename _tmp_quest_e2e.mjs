const BACKEND = 'http://localhost:9001'
const AGENTS = 'http://localhost:9003'
const USER_ID = 'e8def90c-424f-4d3e-b7ed-9337b68adf65'
const CAMPAIGN = '5e751320-e7fc-487b-8c56-0a72e10112d9'
const SVC = 'diad-internal-dev'
const HDRS = {
  'Content-Type': 'application/json',
  'X-Service-Key': SVC,
  'X-User-Id': USER_ID,
}

async function api(base, path, init = {}) {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...HDRS, ...(init.headers ?? {}) },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status}\n${text}`)
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

const sessName = `Solo: QuestE2E ${new Date().toISOString().slice(0,19)}`
console.log('→ POST /sessions ...')
const sess = await api(BACKEND, '/game/sessions', {
  method: 'POST',
  body: JSON.stringify({ name: sessName, campaignId: CAMPAIGN }),
})
console.log(`✅ session created: ${sess.id} (${sess.name})`)

console.log('→ GET /sessions/' + sess.id + '/quests ...')
const quests = await api(BACKEND, `/sessions/${sess.id}/quests`)
console.log(`✅ quests: ${quests.length}`)
for (const q of quests) {
  console.log(`  · ${q.name} [${q.status}]${q.isMainQuest ? ' ⭐MAIN' : ''}`)
  for (const o of (q.objectives ?? []).sort((a,b)=>a.sortOrder-b.sortOrder)) {
    console.log(`     [${o.sortOrder}] ${o.status}: ${o.description.slice(0,80)}`)
  }
}

// Cache pra próximas fases
console.log('\n=== SESSION_ID=' + sess.id + ' ===')
