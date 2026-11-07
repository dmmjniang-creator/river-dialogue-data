#!/usr/bin/env node
/**
 * 记忆归档 · 抽钩子
 * 从思维链里抽「能撞的词」——一读就把一整圈语义场点亮的词。
 *
 * 用法：
 *   node 抽钩子.mjs 归档\思维\chunk-13.md
 *   node 抽钩子.mjs 归档\思维\chunk-13.md --per 2 --dry
 *
 * 输出：归档\思维\钩子.md（追加）
 *
 * 三代都试过，记在这儿免得回头重走：
 *   v1  2–4 字滑窗 + 词频 → 中文没分词，全是「把思维链」「按更严的」这种跨词碎片。
 *   v2  只收引号和加粗 → 好多了，但一个长块（seq 1700）淹了全部，还混进「她说」「我说」。
 *   v3  只收引号和加粗 + **每块限量、短的优先**。宁可漏，不要淹。
 *
 * 判据：被引、被加粗，就是说话人自己认为该记住的。不统计、不猜。
 */
import fs from 'node:fs'
import path from 'node:path'
import { 归档 } from '../路径.mjs'

const OUT = path.join(归档, '思维', '钩子.md')

const 文件 = process.argv[2]
if (!文件) {
  console.log('用法: node 抽钩子.mjs <思维链.md> [--per N] [--dry]')
  process.exit(1)
}
const 全文 = fs.readFileSync(文件, 'utf8')

const 参数 = (名, 默认) => {
  const i = process.argv.indexOf(名)
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 默认
}
const 每块上限 = 参数('--per', 2)

// ---- 按 ### seq= 切块 ----
const re = /^### seq=(\d+)(.*)$/gm
const 位置 = []
let m
while ((m = re.exec(全文)) !== null) 位置.push({ seq: m[1], at: m.index, 尾: m[0] })
const 块 = []
for (let i = 0; i < 位置.length; i++) {
  const s = 位置[i].at
  const e = i + 1 < 位置.length ? 位置[i + 1].at : 全文.length
  块.push({ seq: 位置[i].seq, 正文: 全文.slice(s + 位置[i].尾.length, e) })
}
if (!块.length) 块.push({ seq: '?', 正文: 全文 })

const 引号 = /[「"“]([^」"”\n]{2,40})[」"”]/g
const 加粗 = /\*\*([^*\n]{2,40})\*\*/g

// 碎片黑名单：人称 + 说、工具名、路径、数字
const 垃圾 = /^(她说|我说|他说|你说|我|你|他|她|它|这个|那个|这样|那样|可以|不能|不是|就是|如果|然后|所以|但是|因为)$/
function 可用(w) {
  const s = w.trim()
  if (s.length < 2 || s.length > 40) return false
  if (垃圾.test(s)) return false
  if (/[\\/|<>{}`]/.test(s)) return false
  if (/[\[\]]/.test(s)) return false
  if (/\.(mjs|md|json|txt|js|zstd)\b/.test(s)) return false
  if (/^(node|npm|git) /.test(s)) return false
  if (/^\d/.test(s)) return false
  return true
}

const 结果 = []
const 已收 = new Set()

for (const b of 块) {
  const 本块 = new Map() // 词 → { 句, 从哪 }
  for (const 句 of b.正文.split(/(?<=[。！？；\n])/).map((s) => s.trim()).filter(Boolean)) {
    let mm
    引号.lastIndex = 0
    while ((mm = 引号.exec(句)) !== null) {
      const w = mm[1].trim()
      if (可用(w) && !本块.has(w)) 本块.set(w, { 句, 从哪: '引号', 长: w.length })
    }
    加粗.lastIndex = 0
    while ((mm = 加粗.exec(句)) !== null) {
      const w = mm[1].trim()
      if (可用(w) && !本块.has(w)) 本块.set(w, { 句, 从哪: '加粗', 长: w.length })
    }
  }
  // 本块：短的优先（短的多半是造出来的概念，长的多半是引用）
  const 取 = [...本块.entries()].sort((a, b2) => a[1].长 - b2[1].长).slice(0, 每块上限)
  for (const [w, v] of 取) {
    if (已收.has(w)) continue
    已收.add(w)
    结果.push({ 词: w, seq: b.seq, ...v })
  }
}

console.log(`思维块 ${块.length} 个，每块取 ${每块上限}，抽出 ${结果.length} 条`)

const 表 =
  '| 钩子 | 来源 | seq | 第一次出现的那句 |\n| --- | --- | --- | --- |\n' +
  结果.map((r) => `| ${r.词} | ${r.从哪} | ${r.seq} | ${r.句.slice(0, 70).replace(/\|/g, '｜')} |`).join('\n')

if (process.argv.includes('--dry')) {
  console.log('\n' + 表)
  process.exit(0)
}

const 头 = [
  '',
  `## ${path.basename(文件, '.md')}（${new Date().toISOString().slice(0, 16).replace('T', ' ')}）`,
  '',
  '> 只收说话人自己标过的地方——引号和加粗，每块限两条、短的优先。',
  `> 原文在 \`${path.basename(文件)}\`。`,
  '',
]
fs.mkdirSync(path.dirname(OUT), { recursive: true })
const 已有 = fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8')
  : '# 钩子\n\n> 从思维链里抽「能撞的词」。词离开上下文会丢关系，所以每条都配它第一次出现的那一句。\n'
fs.writeFileSync(OUT, 已有 + 头.join('\n') + '\n' + 表 + '\n', 'utf8')
console.log('追加到', OUT)
