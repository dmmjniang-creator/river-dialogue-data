#!/usr/bin/env node
/**
 * 记忆归档 · 事实键 / 取代链
 *
 * 扫 `记忆库\条目\`，按 `事实键`（「对象.方面」）收敛：同一个键只留最新有效，
 * 旧的标 `已被取代: [[新的那条]]` —— 不删、可撤销、看得见。
 *
 *   node 键.mjs            只报（不写文件）
 *   node 键.mjs --apply    真写「已被取代」
 *   node 键.mjs --keys x   列出没挂事实键的条目
 *
 * 认不出就不给键：猜错的事实键会把两条不相干的事串成一条链。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 这里 = path.dirname(fileURLToPath(import.meta.url))
const { readdirSync, readFileSync } = fs
const 条目目录 = path.resolve(这里, '..', '..', '记忆库', '条目')

function 解析头(text) {
  const 行 = text.split('\n')
  const 头 = {}
  if (行[0]?.trim() !== '---') return 头
  for (let i = 1; i < 行.length; i++) {
    if (行[i].trim() === '---') break
    const m = /^([^:#][^:]*):\s*(.*)$/.exec(行[i])
    if (m) 头[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return 头
}

const 名单 = readdirSync(条目目录)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const p = path.join(条目目录, f)
    const 头 = 解析头(readFileSync(p, 'utf8'))
    return { 文件: f, 名字: f.replace(/\.md$/, ''), 路径: p, 键: 头['事实键'] || '', 日期: 头['日期'] || '', 已被取代: 头['已被取代'] || '', mtime: fs.statSync(p).mtimeMs }
  })

const 排序 = (a, b) => (Date.parse(b.日期 || '') || b.mtime) - (Date.parse(a.日期 || '') || a.mtime)
const 按 = new Map()
for (const it of 名单) if (it.键) 按.set(it.键, [...(按.get(it.键) || []), it])

const 只报 = !process.argv.includes('--apply')
const 改 = []
for (const [键, 组] of 按) {
  if (组.length < 2) continue
  组.sort(排序)
  for (const it of 组.slice(1)) {
    const 目标 = `[[${组[0].名字}]]`
    if (it.已被取代 !== 目标) 改.push({ 键, 名: it.名字, 留: 组[0].名字, 目标 })
  }
}

console.log(`条目 ${名单.length} 条，挂了事实键的 ${按.size} 个键`)
for (const [键, 组] of [...按].sort()) {
  if (组.length > 1) {
    组.sort(排序)
    console.log(`  冲突 ${键}: 留 ${组[0].名字}，压 ${组.slice(1).map((x) => x.名字).join('、')}`)
  }
}
const 空的 = 名单.filter((x) => !x.键)
if (空的.length) console.log(`\n没挂事实键的 ${空的.length} 条：\n  ` + 空的.map((x) => x.名字).join('\n  '))

if (!改.length) {
  console.log('\n没有要改的（要么没冲突，要么已经标好）')
  process.exit(0)
}

if (只报) {
  console.log('\n只报：要改 ' + 改.length + ' 条')
  for (const x of 改) console.log(`  ${x.名} → 已被取代: ${x.目标}`)
  console.log('\n加 --apply 才真写')
  process.exit(0)
}

for (const x of 改) {
  const it = 名单.find((y) => y.名字 === x.名)
  const 行 = readFileSync(it.路径, 'utf8').split('\n')
  let 动 = false
  for (let i = 0; i < 行.length; i++) {
    if (/^已被取代:/.test(行[i])) { 行[i] = `已被取代: ${x.目标}`; 动 = true; break }
    if (行[i].trim() === '---' && i > 0) { 行.splice(i, 0, `已被取代: ${x.目标}`); 动 = true; break }
  }
  if (动) fs.writeFileSync(it.路径, 行.join('\n'), 'utf8')
}
console.log(`\n改了 ${改.length} 条`)
