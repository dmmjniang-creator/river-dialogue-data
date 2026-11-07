// 建索引：把记忆库里所有 .md 扫一遍，生成「002 目录.md」
// 用法：node 建索引.mjs
// 重复跑会覆盖；只读记忆库，只写这一个文件。

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, extname, dirname, basename } from 'node:path'
import { 记忆库 } from './路径.mjs'

const ROOT = 记忆库
const OUT = join(ROOT, '002 目录.md')
const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', 'backup'])

function 走(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      out.push(...走(p))
    } else if (extname(name).toLowerCase() === '.md') {
      if (p === OUT) continue
      out.push(p)
    }
  }
  return out
}

function 摘(file) {
  let text = ''
  try { text = readFileSync(file, 'utf8') } catch { return null }
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const name = basename(file, '.md')

  // frontmatter
  let date = ''
  let tags = ''
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm) {
    const d = fm[1].match(/^日期:\s*(.+)$/m)
    if (d) date = d[1].trim()
    const t = fm[1].match(/^标签:\s*\n((?:\s*-\s*.+\n?)+)/m)
    if (t) tags = t[1].split(/\r?\n/).map((s) => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean).join(' / ')
  }
  if (!date) {
    const m = name.match(/(\d{4}-\d{2}-\d{2})/)
    if (m) date = m[1]
  }

  // 标题
  const h = text.match(/^#\s+(.+)$/m)
  const title = h ? h[1].trim() : name

  // 摘要：去掉 frontmatter / 标题 / 引用块 / 表格，取第一段
  const body = text.replace(/^---[\s\S]*?---/, '').replace(/^#.*$/gm, '')
  const 段 = body
    .split(/\r?\n\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('>') && !s.startsWith('|') && !s.startsWith('- ') && !s.startsWith('*'))
  let 摘 = (段[0] || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\[\[(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim()
  if (摘.length > 90) 摘 = 摘.slice(0, 90) + '…'

  return { rel, name, title, date, tags, 摘 }
}

const 全部 = 走(ROOT).map(摘).filter(Boolean)
const 组 = new Map()
for (const it of 全部) {
  const d = dirname(it.rel).replace(/\\/g, '/')
  const k = d === '.' ? '（根）' : d
  if (!组.has(k)) 组.set(k, [])
  组.get(k).push(it)
}

const 顺序 = ['（根）', '条目', '日记', '事件', '人物', '归档', '归档/notes', '模板']
const 键 = [...组.keys()].sort((a, b) => {
  const ia = 顺序.indexOf(a); const ib = 顺序.indexOf(b)
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
})

const L = []
L.push('# 002 目录')
L.push('')
L.push(`> 自动生成，别手改 —— 跑 \`node scripts/建索引.mjs\` 刷新。`)
L.push(`> 生成于 ${new Date().toLocaleString('zh-CN', { hour12: false })}，共 ${全部.length} 个文件。`)
L.push('> 搜内容用 `node scripts/记忆搜.mjs 关键词`；这份只管「有什么、在哪、一句话」。')
L.push('')
for (const k of 键) {
  const items = 组.get(k).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name))
  L.push(`## ${k}（${items.length}）`)
  L.push('')
  for (const it of items) {
    const 尾巴 = [it.title, it.date, it.tags ? `#${it.tags}` : '', it.摘].filter(Boolean).join(' · ')
    L.push(`- [[${it.name}]] — ${it.摘 || it.title}`)
  }
  L.push('')
}

writeFileSync(OUT, L.join('\n'), 'utf8')
console.log(`写了 ${OUT}`)
console.log(`共 ${全部.length} 个文件，${组.size} 组`)
