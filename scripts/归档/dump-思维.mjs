// 从一个会话里 dump 思维链，只留含关键词的块
// 公开版：不传关键词就全 dump（作者本机那份给了几个默认词，这里去掉了）
import fs from 'node:fs'
import zlib from 'node:zlib'

const p = process.argv[2]
const KEY = new RegExp(process.argv[3] || '.', 'i')

const buf = fs.readFileSync(p)
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const pos = []
let i = 0
while ((i = buf.indexOf(MAGIC, i)) !== -1) { pos.push(i); i += 4 }
const parts = []
for (let k = 0; k < pos.length; k++) {
  const s = pos[k], e = k + 1 < pos.length ? pos[k + 1] : buf.length
  try { parts.push(zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8')) } catch {}
}
const lines = parts.join('').split('\n').filter(Boolean)

let n = 0
let hit = 0
for (const l of lines) {
  let j
  try { j = JSON.parse(l) } catch { continue }
  if (j.type !== 'assistant/message') continue
  for (const c of (j.data?.message?.content || [])) {
    if (c.type !== 'reasoning') continue
    const t = (c.text || '').trim()
    if (!t) continue
    n++
    if (!KEY.test(t)) continue
    hit++
    console.log(`\n===== seq=${j.seq} · reasoning #${n} · ${t.length} 字 =====`)
    console.log(t.length > 3000 ? t.slice(0, 3000) + '\n…（截断）' : t)
  }
}
console.log(`\n--- 思维块 ${n} 个，命中 ${hit} 个 ---`)
