const HDRS = {
  'Content-Type': 'application/json',
  'X-Service-Key': 'diad-internal-dev',
  'X-User-Id': 'e8def90c-424f-4d3e-b7ed-9337b68adf65',
}
const SESSION = process.argv[2]
const PLAYER_INPUT = process.argv[3]

const t0 = Date.now()
const r = await fetch('http://localhost:9003/narrative/turn', {
  method: 'POST', headers: HDRS,
  body: JSON.stringify({ campaignId: '5e751320-e7fc-487b-8c56-0a72e10112d9', sessionId: SESSION, playerInput: PLAYER_INPUT }),
})
if (!r.ok) { console.error(`HTTP ${r.status}: ${await r.text()}`); process.exit(2) }

const reader = r.body.getReader()
const dec = new TextDecoder()
let buf = '', sceneAnchor = null, questPayload = null
while (true) {
  const { value, done } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n'); buf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    let json; try { json = JSON.parse(line.slice(6)) } catch { continue }
    const t = json.type ?? json.event
    if (t === 'scene_anchor') sceneAnchor = json
    if (t === 'quest_judgment') {
      questPayload = json
      console.log(`📜 quest_judgment @ ${((Date.now()-t0)/1000).toFixed(1)}s`)
      console.log(JSON.stringify(json.actions_decided, null, 2))
    }
  }
}
console.log(`\nscene_anchor: ${JSON.stringify(sceneAnchor).slice(0,400)}`)

const q = await fetch(`http://localhost:9001/sessions/${SESSION}/quests`, { headers: HDRS }).then(r=>r.json())
console.log('\nQuests post-turn:')
for (const qq of q) {
  console.log(`· ${qq.name} [${qq.status}]`)
  for (const o of (qq.objectives ?? []).sort((a,b)=>a.sortOrder-b.sortOrder)) {
    console.log(`   [${o.sortOrder}] ${o.status}: ${o.description.slice(0,60)} ← ${(o.advanceEvidence ?? '').slice(0,80)}`)
  }
}
