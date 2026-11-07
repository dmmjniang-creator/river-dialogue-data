// 记忆搜：在记忆库里按关键词搜，输出 文件:行 + 上下文
// 用法：
//   node 记忆搜.mjs 签名
//   node 记忆搜.mjs 签名 落款        (多个词 = AND)
//   node 记忆搜.mjs -l 插件           (只列文件)
//   node 记忆搜.mjs -n 挂件 密码      (排除词)
//   node 记忆搜.mjs -r 插件           (--rank：按匹配/时间/可信/关联打分排序)
//
// 只读，不改任何文件。
//
// --rank 的分数只用「能数的信号」：命中位置、类型、日期、状态、被引用次数。
// 不猜语义。每条都给理由，看得见为什么排第一。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname, basename } from 'node:path'
import { 记忆库, 产出, 根 } from './路径.mjs'

const BASES = [记忆库, 产出]
const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', 'backup'])

const argv = process.argv.slice(2)
let 只列文件 = false
let 打分 = false
let 最多 = 80
const 词 = []
const 排除 = []
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a === '-l') 只列文件 = true
  else if (a === '-r' || a === '--rank') 打分 = true
  else if (a === '-n') { i += 1; 排除.push(String(argv[i] || '').toLowerCase()) }
  else if (a === '-m') { i += 1; 最多 = Number(argv[i]) || 80 }
  else 词.push(a.toLowerCase())
}
if (!词.length) {
  console.log('用法: node 记忆搜.mjs <关键词...> [-l] [-r] [-n 排除词] [-m 条数]')
  process.exit(1)
}

function 走(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      out.push(...走(p))
    } else if (extname(name).toLowerCase() === '.md') {
      out.push(p)
    }
  }
  return out
}

const files = BASES.flatMap((b) => 走(b)).sort()
const docs = []
for (const f of files) {
  let text = ''
  try { text = readFileSync(f, 'utf8') } catch { continue }
  const lower = text.toLowerCase()
  if (!词.every((w) => lower.includes(w))) continue
  if (排除.some((w) => w && lower.includes(w))) continue
  docs.push({ rel: relative(根, f).replace(/\\/g, '/'), name: basename(f, '.md'), text, lower })
}

// ---- 默认输出 ----
if (!打分) {
  let n = 0
  for (const d of docs) {
    n += 1
    if (n > 最多) { console.log(`\n—— 还有 ${docs.length - 最多} 个超出 -m 没列 ——`); break }
    if (只列文件) { console.log(d.rel); continue }
    const lines = d.text.split(/\r?\n/)
    let 头 = lines.find((l) => l.startsWith('# ')) || ''
    头 = 头.replace(/^#\s*/, '').trim()
    console.log(`\n${d.rel}${头 ? '  ·  ' + 头 : ''}`)
    let k = 0
    for (let i = 0; i < lines.length && k < 3; i += 1) {
      const l = lines[i].toLowerCase()
      if (词.every((w) => l.includes(w))) {
        const t = lines[i].trim()
        console.log(`  ${String(i + 1).padStart(4)}: ${t.length > 140 ? t.slice(0, 140) + '…' : t}`)
        k += 1
      }
    }
  }
  if (!docs.length) console.log('没找到。')
  else console.log(`\n—— ${docs.length} 个文件命中 ——`)
  process.exit(0)
}

// ---- 打分（--rank）----
const 类型权重 = { 底账: 3, 关键词: 3, 关键词索引: 3, 看板: 2, 偏好: 2, 记忆: 1, 学习笔记: 0, 人物: 1 }
const 不衰减 = new Set(['底账', '关键词', '关键词索引', '看板', '偏好'])

// 被引用次数：别的文件里出现 [[本文件名]]
const 引用数 = new Map()
for (const d of docs) 引用数.set(d.name, 0)
for (const f of files) {
  let t = ''
  try { t = readFileSync(f, 'utf8') } catch { continue }
  for (const m of t.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const key = m[1].split('/').pop().replace(/\.md$/, '')
    if (引用数.has(key)) 引用数.set(key, 引用数.get(key) + 1)
  }
}

const today = Date.now()
const 天 = (s) => { const d = new Date(s); return isNaN(d) ? null : (today - d.getTime()) / 86400000 }
const pick = (text, key) => (text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')) || [])[1] || ''
const fm = (text) => (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || ''
const 显式未核 = (text) =>
  /^可信度:\s*未核/m.test(fm(text)) || /(^|\n)[-*]\s*\*\*未核\*\*/.test(text) || /(^|\n)未核[：:]/.test(text)

const scored = []
for (const d of docs) {
  const why = []
  let s = 0
  const lines = d.text.split(/\r?\n/)
  const 标题 = (lines.find((l) => l.startsWith('# ')) || '').toLowerCase()
  const 全文命中 = (d.lower.match(new RegExp(词.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')) || []).length
  if (词.every((w) => 标题.includes(w))) { s += 3; why.push('标题 +3') }
  const 正文 = Math.min(全文命中, 5)
  if (正文) { s += 正文; why.push(`正文命中 ${正文} 处 +${正文}`) }

  const fmText = fm(d.text)
  const t = (fmText.match(/^类型:\s*(.+)$/m) || [])[1]?.trim() || ''
  let tw = 类型权重[t] || 0
  let twWhy = tw ? `类型「${t}」+${tw}` : ''
  if (!t) {
    if (d.rel.startsWith('结构/')) { tw = 2; twWhy = '规程 +2' }
    else if (d.rel.startsWith('归档/')) { tw = -1; twWhy = '归档原料 -1' }
    else if (d.rel.startsWith('产出/')) { tw = 1; twWhy = '产出物 +1' }
  }
  if (tw) { s += tw; why.push(twWhy) }

  if (!不衰减.has(t)) {
    const dateStr = (fmText.match(/^(?:更新|日期):\s*(.+)$/m) || [])[1]
    const age = dateStr ? 天(dateStr) : null
    if (age != null) {
      if (age < 7) { s += 2; why.push('7 天内 +2') }
      else if (age < 30) { s += 1; why.push('30 天内 +1') }
      else if (age > 180) { s -= 2; why.push('半年前 -2') }
    }
  }

  if (显式未核(d.text)) { s -= 2; why.push('标了未核 -2') }
  const st = (fmText.match(/^状态:\s*(.+)$/m) || [])[1]?.trim() || ''
  if (st === '已废弃' || st === '被取代') { s -= 5; why.push(`状态 ${st} -5`) }

  const refs = 引用数.get(d.name) || 0
  if (refs) { const add = Math.min(refs * 0.5, 3); s += add; why.push(`被引用 ${refs} 次 +${add.toFixed(1)}`) }

  scored.push({ ...d, s, why: why.join('，') || '无加分项' })
}

scored.sort((a, b) => b.s - a.s)
console.log(`—— 命中 ${scored.length} 个，按分排序 ——`)
for (const d of scored.slice(0, 最多)) {
  console.log(`\n[${d.s.toFixed(1)}] ${d.rel}\n       ${d.why}`)
}
