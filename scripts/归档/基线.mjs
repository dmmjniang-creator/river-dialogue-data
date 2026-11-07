#!/usr/bin/env node
/**
 * 记忆归档 · 刷新档案基线
 * 把记忆库里所有 .md 的大小、修改时间、sha256 记进 .档案基线.json。
 * 下次动档案前先跑一次对比（脚本里的 --check 只对比不写）。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { 记忆库 } from '../路径.mjs'

const VAULT = 记忆库
const BASE = path.join(VAULT, '.档案基线.json')
const check = process.argv.includes('--check')

function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === '.obsidian' || d.name === '归档') continue
    const p = path.join(dir, d.name)
    if (d.isDirectory()) walk(p, out)
    else if (d.name.endsWith('.md')) out.push(p)
  }
  return out
}

const now = {}
for (const f of walk(VAULT)) {
  const rel = path.relative(VAULT, f).replace(/\\/g, '/')
  const buf = fs.readFileSync(f)
  now[rel] = {
    size: buf.length,
    mtime: Math.round(fs.statSync(f).mtimeMs),
    sha256: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
  }
}

if (check) {
  if (!fs.existsSync(BASE)) { console.log('还没有基线。'); process.exit(0) }
  const old = JSON.parse(fs.readFileSync(BASE, 'utf8')).files || {}
  const added = Object.keys(now).filter((k) => !old[k])
  const removed = Object.keys(old).filter((k) => !now[k])
  const changed = Object.keys(now).filter((k) => old[k] && old[k].sha256 !== now[k].sha256)
  console.log('新增', added.length, added.join(', ') || '—')
  console.log('删除', removed.length, removed.join(', ') || '—')
  console.log('改动', changed.length, changed.join(', ') || '—')
  process.exit(0)
}

fs.writeFileSync(BASE, JSON.stringify({ updatedAt: new Date().toISOString(), files: now }, null, 2), 'utf8')
console.log('基线已刷新，共', Object.keys(now).length, '个文件 ->', BASE)
