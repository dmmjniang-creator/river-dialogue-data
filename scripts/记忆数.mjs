#!/usr/bin/env node
/** 记忆数 —— 报条目数、状态分布、目录行数、同位置版本数。
 *  用法：node scripts/记忆数.mjs
 *  规则：同一位置写到第三版，第一条回收；条目 400 是硬顶。
 */
import fs from 'node:fs'
import path from 'node:path'
import { 记忆库 } from './路径.mjs'

const VAULT = 记忆库
const ENTRY = path.join(VAULT, '条目')
const INDEX = path.join(VAULT, '001 索引.md')
const MAX_ENTRY = 400
const MAX_LIST = 150
const MAX_VERSION = 3

const files = fs.readdirSync(ENTRY).filter((f) => f.endsWith('.md'))
const byStatus = { 在用: 0, 已废弃: 0, 被取代: 0 }
const keys = new Map()
const rows = []
for (const f of files) {
  const text = fs.readFileSync(path.join(ENTRY, f), 'utf8')
  const s = (text.match(/^状态:\s*(\S+)/m) || [])[1] || '在用'
  byStatus[s] = (byStatus[s] || 0) + 1
  const k = (text.match(/^事实键:\s*(\S+)/m) || [])[1]
  if (k) keys.set(k, (keys.get(k) || 0) + 1)
  const imp = Number((text.match(/^重要度:\s*([\d.]+)/m) || [])[1] ?? NaN)
  const date = (text.match(/^日期:\s*([\d-]+)/m) || [])[1] || ''
  rows.push({ f: f.replace(/\.md$/, ''), s, imp: isNaN(imp) ? 0.5 : imp, date })
}

const idx = fs.readFileSync(INDEX, 'utf8')
const sec = (idx.split('## 最近记下的')[1] || '').split(/\n## /)[0]
const listed = (sec.match(/^- \[\[/gm) || []).length

const fmt = (used, max) => `${used} / ${max}（剩 ${max - used}${used > max ? '，超了' : ''}）`
console.log(`条目：${fmt(files.length, MAX_ENTRY)}`)
console.log(`目录（最近记下的）：${fmt(listed, MAX_LIST)}`)
console.log(`状态：${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

const old = [...keys.entries()].filter(([, n]) => n >= MAX_VERSION)
console.log(`同位置（事实键）≥${MAX_VERSION} 版：${old.length ? old.map(([k, n]) => `${k}(${n})`).join(' · ') : '无'}`)
if (old.length) console.log('  ↑ 按规则，这些位置的最早一版可以回收了。')

const low = rows
  .filter((r) => r.s === '在用')
  .sort((a, b) => a.imp - b.imp || a.date.localeCompare(b.date))
  .slice(0, 5)
if (low.length) {
  console.log('重要度最低的 5 条（回收从这里挑，被 [[引用]] 过的不动）：')
  for (const r of low) console.log(`  ${r.imp.toFixed(2)}  ${r.date}  ${r.f}`)
}
if (files.length >= MAX_ENTRY) console.log('\n⚠️ 条目到硬顶：按「废弃 → 重要度低 → 最久」继续收。')
