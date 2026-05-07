const BACKEND = 'http://localhost:9001'
const AGENTS = 'http://localhost:9003'
const USER_ID = 'e8def90c-424f-4d3e-b7ed-9337b68adf65'
const CAMPAIGN = '5e751320-e7fc-487b-8c56-0a72e10112d9'
const SESSION = process.argv[2]
const PLAYER_INPUT = process.argv[3]
const SVC = 'diad-internal-dev'
const HDRS = {
  'Content-Type': 'application/json',
  'X-Service-Key': SVC,
  'X-User-Id': USER_ID,
}

if (!SESSION || !PLAYER_INPUT) { console.error('usage: node _tmp_turn.mjs <sessionId> <playerInput>'); process.exit(1) }

console.log(`→ POST /narrative/turn — input="${PLAYER_INPUT}"`)
const t0 = Date.now()
const r = await fetch(`${AGENTS}/narrative/turn`, {
  method: 'POST',
  headers: HDRS,
  body: JSON.stringify({ campaignId: CAMPAIGN, sessionId: SESSION, playerInput: PLAYER_INPUT }),
})
if (!r.ok) { console.error(`HTTP ${r.status}: ${await r.text()}`); process.exit(2) }

const reader = r.body.getReader()
const dec = new TextDecoder()
let buf = ''
const interesting = ['scene_anchor', 'quest_judgment', 'session_sync', 'narrator_done', 'done', 'error']
let questPayload = null, sceneAnchor = null, narratorChunks = 0, narratorText = ''
while (true) {
  const { value, done } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    let json
    try { json = JSON.parse(line.slice(6)) } catch { continue }
    const type = json.type ?? json.event
    if (type === 'narrator_chunk' || type === 'token' || type === 'narrator_token') {
      narratorChunks++
      narratorText += (json.delta ?? json.text ?? json.token ?? '')
      continue
    }
    if (type === 'scene_anchor') sceneAnchor = json.payload ?? json
    if (type === 'quest_judgment') {
      questPayload = json.payload ?? json
      console.log(`📜 quest_judgment received @ ${((Date.now()-t0)/1000).toFixed(1)}s:`)
      console.log(JSON.stringify(questPayload, null, 2))
    }
    if (interesting.includes(type)) {
      console.log(`  ← ${type} @ ${((Date.now()-t0)/1000).toFixed(1)}s`)
    }
  }
}
console.log(`\n— narrator chunks: ${narratorChunks} | text len: ${narratorText.length}`)
console.log(`— first 400 chars: ${narratorText.slice(0,400)}`)
if (sceneAnchor) console.log(`— scene_anchor: ${JSON.stringify(sceneAnchor).slice(0,400)}`)
console.log(`— total elapsed: ${((Date.now()-t0)/1000).toFixed(1)}s`)

// Listar quests pra ver estado pós-turn
async function api(base, path, init = {}) {
  const r = await fetch(`${base}${path}`, { ...init, headers: { ...HDRS, ...(init.headers ?? {}) } })
  const text = await r.text()
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}
console.log('\n→ GET quests (post-turn):')
const quests = await api(BACKEND, `/sessions/${SESSION}/quests`)
for (const q of quests) {
  console.log(`  · ${q.name} [${q.status}]${q.isMainQuest ? ' ⭐MAIN' : ''}`)
  for (const o of (q.objectives ?? []).sort((a,b)=>a.sortOrder-b.sortOrder)) {
    const ev = o.advanceEvidence ? ` ← ${o.advanceEvidence.slice(0,80)}` : ''
    console.log(`     [${o.sortOrder}] ${o.status}: ${o.description.slice(0,70)}${ev}`)
  }
}
