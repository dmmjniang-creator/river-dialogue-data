#!/usr/bin/env node
/**
 * 记忆体检
 * 功能：查「丢得静音」的几处——索引漏条、目录死链、分区数量对不上、底账页过期、字段/唯一性、投影落后。
 * 为什么：`002 目录` 是自动生成的，但它自己不会说自己过时了；底账答「现在」，可没人定期核对「现在还对不对」；
 *   投影是天平的另一头——真本改了、投影没跟上，检索就会给我旧的那一份，而这种「旧」不会报错。
 *   投影和日记双写的内容比对归 `记忆同步.mjs`（它的退出码就是信号）；这里只管**新鲜度**，只看 mtime。
 * 边界：只读，不改任何文件。退出码：漏条 / 死链 / 数量不符 / 字段 / 唯一性 / 投影落后 → 1，只有「底账该核查」→ 0。
 * 用法：node 记忆体检.mjs
 * 最后改：2026-11-09
 */
import fs from 'node:fs'
import path from 'node:path'
import { 根, 记忆库 } from './路径.mjs'

const 跳过 = new Set(['.git', '.obsidian'])
const 扫 = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!跳过.has(e.name)) 扫(p, out); continue }
    if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}
const 盘上 = 扫(记忆库)
const 盘名 = new Map(盘上.map((p) => [path.basename(p, '.md'), p]))

const 目录文件 = path.join(记忆库, '002 目录.md')
if (!fs.existsSync(目录文件)) { console.error('找不到 002 目录.md'); process.exit(1) }
const 目录文 = fs.readFileSync(目录文件, 'utf8')

// 002 引用的名字（去重，保序）
const 引用 = []
for (const m of 目录文.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
  const n = m[1].trim()
  if (!引用.includes(n)) 引用.push(n)
}
const 引用集 = new Set(引用)
// 002 不列自己（建索引时就是这么生成的），所以它不算漏
const 排除 = new Set(['002 目录'])
const 漏 = [...盘名.keys()].filter((n) => !引用集.has(n) && !排除.has(n))
const 死链 = 引用.filter((n) => !盘名.has(n))

// 分区标题写着的数量 vs 实际条目行数
const 段 = 目录文.split(/^## /m).slice(1)
const 数量不符 = []
for (const s of 段) {
  const 头 = s.split('\n')[0]
  const m = /（(\d+)）/.exec(头)
  if (!m) continue
  const 实 = (s.match(/^- \[\[/gm) || []).length
  if (Number(m[1]) !== 实) 数量不符.push(`${头.trim()}：写着 ${m[1]}，实际 ${实}`)
}

// 底账页：frontmatter 的「更新」离今天多久
const 今天 = new Date()
const 底账目录 = path.join(记忆库, '底账')
const 该核 = []
if (fs.existsSync(底账目录)) {
  for (const f of fs.readdirSync(底账目录).filter((n) => n.endsWith('.md'))) {
    const t = fs.readFileSync(path.join(底账目录, f), 'utf8')
    const m = /^更新:\s*(\d{4})-(\d{2})-(\d{2})/m.exec(t)
    if (!m) { 该核.push(`${f}：没写「更新」日期`); continue }
    const 天 = Math.floor((今天 - new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`)) / 86400000)
    if (天 > 30) 该核.push(`${f}：${天} 天没核过`)
  }
}

// ---- 五、字段与命名（规范见 结构\字段规范.md，2026-11-08 定）----
const 读头 = (p) => {
  const t = fs.readFileSync(p, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t)
  if (!m) return null
  const 单 = {}, 列 = {}
  let 当前 = null
  for (const l of m[1].split(/\r?\n/)) {
    const kv = /^([^\s:-][^:]*):\s*(.*)$/.exec(l)
    if (kv) { 当前 = kv[1].trim(); if (kv[2].trim()) 单[当前] = kv[2].trim(); else 列[当前] = []; continue }
    const li = /^\s+-\s+(.*)$/.exec(l)
    if (li && 当前) (列[当前] ||= []).push(li[1].trim())
  }
  return { 单, 列 }
}
const 缺键 = [], 格式错 = [], 名不符 = []
const 别名表 = new Map(), 事实键表 = new Map()
for (const p of 盘上) {
  const 区 = path.relative(记忆库, p).split(path.sep)[0]
  const 名 = path.basename(p, '.md')
  if (区 !== '条目' && 区 !== '底账') continue
  const h = 读头(p)
  const 需 = 区 === '条目' ? ['类型', '日期', '事实键', '标签', '重要度'] : ['类型', '对象', '方面', '更新']
  const 缺 = 需.filter((k) => !h?.单[k] && !h?.列[k])
  if (!h || 缺.length) 缺键.push(`${区}\\${名} 缺 ${缺.join('/') || '整个 frontmatter'}`)
  const 日 = 区 === '条目' ? h?.单['日期'] : h?.单['更新']
  const 日名 = 区 === '条目' ? '日期' : '更新'
  if (日 && !/^\d{4}-\d{2}-\d{2}$/.test(日)) 格式错.push(`${区}\\${名} ${日名}=${日}`)
  if (区 === '底账' && h?.单['对象'] && h?.单['方面'] && h.单['对象'] + h.单['方面'] !== 名)
    名不符.push(`底账\\${名} ≠ ${h.单['对象']}+${h.单['方面']}`)
  if (区 === '条目' && h?.单['事实键']) {
    const k = h.单['事实键']
    if (!事实键表.has(k)) 事实键表.set(k, [])
    事实键表.get(k).push(名)
  }
  for (const a of (h?.列['别名'] || [])) {
    const k = a.replace(/^\[\[|\]\]$/g, '')
    if (!别名表.has(k)) 别名表.set(k, [])
    别名表.get(k).push(`${区}\\${名}`)
  }
}
const 别名冲突 = [...别名表.entries()].filter(([, v]) => v.length > 1)
const 事实键冲突 = [...事实键表.entries()].filter(([, v]) => v.length > 1)

// ---- 六、投影新鲜度（2026-11-09 加）----
// 规矩：真本改了、投影还是旧的 → 检索给我旧的那份，而且不报错。这里让它报出来。
// 判据用**内容**，不是 mtime：同步是按内容决定写不写的（内容一样就不写），
// 拿 mtime 比会跟它打架——内容没变但时间变了，同步不写，体检就一直喊落后，喊的是假的。
// 跳过规则跟 记忆同步.mjs 保持一致。
const diaryDir = path.join(path.dirname(根), 'diary')
const 跳过目录 = new Set(['.git', '.obsidian', '日记'])
const 跳过相对 = [/^归档[\\/]思维[\\/]chunk-\d+\.md$/i, /^归档[\\/]思维[\\/]钩子\.md$/i]
const 映射 = (rel) => rel.split(/[\\/]/).join('-')
const 落后 = []
if (fs.existsSync(diaryDir)) {
  for (const p of 盘上) {
    const rel = path.relative(记忆库, p)
    if (跳过目录.has(rel.split(/[\\/]/)[0])) continue   // 日记归双写那条线管，不投影
    if (跳过相对.some((re) => re.test(rel))) continue
    const proj = path.join(diaryDir, 映射(rel))
    if (!fs.existsSync(proj)) { 落后.push(`${rel}：投影不存在`); continue }
    if (!fs.readFileSync(p).equals(fs.readFileSync(proj))) 落后.push(`${rel}：内容和投影不一致`)
  }
} else {
  落后.push(`找不到投影目录：${diaryDir}`)
}

console.log(`字段：缺必填键 ${缺键.length} 个，日期格式错 ${格式错.length} 个，底账名字对不上 ${名不符.length} 个`)
if (缺键.length) console.log('  ' + 缺键.join('\n  '))
if (格式错.length) console.log('  日期：' + 格式错.join('\n  日期：'))
if (名不符.length) console.log('  ' + 名不符.join('\n  '))
console.log(`唯一性：别名撞车 ${别名冲突.length} 处，事实键重复 ${事实键冲突.length} 处`)
if (别名冲突.length) console.log('  别名：' + 别名冲突.map(([k, v]) => `${k} → ${v.join(' / ')}`).join('\n  别名：'))
if (事实键冲突.length) console.log('  事实键：' + 事实键冲突.map(([k, v]) => `${k} → ${v.join(' / ')}`).join('\n  事实键：'))

console.log(`索引：磁盘 ${盘名.size} 个 md，002 引用 ${引用集.size} 个`)
console.log(漏.length ? `漏条 ${漏.length} 个（盘上有、002 没列，跑 建索引.mjs）：\n  ` + 漏.join('\n  ') : '漏条 0 个')
console.log(死链.length ? `死链 ${死链.length} 个（002 列了、盘上没有）：\n  ` + 死链.join('\n  ') : '死链 0 个')
console.log(数量不符.length ? `分区数量对不上 ${数量不符.length} 处：\n  ` + 数量不符.join('\n  ') : '分区数量 0 处不符')
console.log(该核.length ? `底账该核一下 ${该核.length} 页（不是错，是提醒「现在」可能过期）：\n  ` + 该核.join('\n  ') : '底账页日期都还新')
console.log(落后.length ? `投影落后 ${落后.length} 个（跑 记忆同步.mjs 就补上）：\n  ` + 落后.join('\n  ') : '投影都是最新的')

process.exit(漏.length || 死链.length || 数量不符.length || 缺键.length || 格式错.length || 名不符.length || 别名冲突.length || 事实键冲突.length || 落后.length ? 1 : 0)
