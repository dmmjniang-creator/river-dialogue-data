#!/usr/bin/env node
/**
 * 记忆归档 · 体检
 * 功能：归档前的第 0 步——只读，报四样：游标 vs 最新会话、未提交、备份、素材现状。
 * 目的：并发时几个实例写同一个库，谁都不报错。以前靠人记着查，一天撞过三次车。
 * 用法：node scripts/归档/体检.mjs
 * 边界：只读，不写任何文件、不动游标；有异常退出码 1，没有退出码 0。
 * 最后改：2026-11-07
 */
import fs from 'node:fs'
import path from 'node:path'
import { 记忆库, 找会话目录 } from '../路径.mjs'

const VAULT = 记忆库
const CURSOR = path.join(VAULT, '归档', '游标.json')
// 备份盘是每台机器自己的事：设 RIVER_BACKUP 才检查，没设就跳过
const BACKUP = process.env.RIVER_BACKUP || ''

let bad = 0
const warn = (s) => { bad++; console.log('  ⚠️ ' + s) }
const ok = (s) => console.log('  ✓ ' + s)
const fmtTime = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })

// [1] 游标 vs 最新会话
console.log('[1] 游标')
let cur = null
try { cur = JSON.parse(fs.readFileSync(CURSOR, 'utf8')) } catch {}
if (!cur) warn('读不到 归档\\游标.json')
const sessions = 找会话目录()
  .map((dir) => {
    const f = path.join(dir, 'session.v4.jsonl.zstd')
    const st = fs.statSync(f)
    return { id: path.basename(dir), mtime: st.mtimeMs, mb: (st.size / 1048576).toFixed(1) }
  })
  .sort((a, b) => b.mtime - a.mtime)

if (cur) {
  console.log(`  游标：${cur.session}  · 末 seq ${cur.lastSeq}  · chunk ${cur.chunk}  · 更新于 ${cur.updatedAt}`)
}
if (sessions.length) {
  const top = sessions[0]
  console.log(`  最新会话：${top.id}  · ${fmtTime(top.mtime)}  · ${top.mb} MB`)
  const fresh = Date.now() - top.mtime < 30 * 60 * 1000
  if (cur && cur.session === top.id) ok('游标 = 最新会话')
  else if (fresh) console.log('  · 最新会话是正在进行的这场（还没归档，正常）')
  else if (cur) warn('游标落后于最新会话，且最新会话已闲置——两个实例在写同一个库？先看 怎么归档.md 第 0 步')
}

// [2] 未提交（不起 git 子进程——沙箱不让；用「文件比 index 新」的启发式）
console.log('[2] 记忆库未提交（启发式）')
const idxFile = path.join(VAULT, '.git', 'index')
if (!fs.existsSync(idxFile)) warn('没有 .git/index——库不是 git 仓库？')
else {
  const idxM = fs.statSync(idxFile).mtimeMs
  let maxM = 0
  let maxF = ''
  const walk = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name === '.git') continue
      const p = path.join(dir, d.name)
      if (d.isDirectory()) walk(p)
      else if (d.name.endsWith('.md')) {
        const m = fs.statSync(p).mtimeMs
        if (m > maxM) { maxM = m; maxF = path.relative(VAULT, p) }
      }
    }
  }
  walk(VAULT)
  if (maxM > idxM) {
    console.log(`  可能有未提交：${maxF} 比 index 新（${fmtTime(maxM)} > ${fmtTime(idxM)}）`)
    console.log('  （只是启发式；准数得跑 git -C 记忆库 status）')
  } else ok('没有比 index 新的文件')
}

// [3] 备份
console.log('[3] 备份')
if (!BACKUP) console.log('  · 未配置：设环境变量 RIVER_BACKUP 指向备份目录才会检查')
else if (!fs.existsSync(BACKUP)) warn(`${BACKUP} 不在——备份盘没挂？`)
else {
  const g = path.join(BACKUP, '.git')
  if (fs.existsSync(g)) {
    console.log(`  在  ·  .git 最后写 ${fmtTime(fs.statSync(g).mtimeMs)}`)
    const localGit = path.join(VAULT, '.git')
    if (fs.existsSync(localGit)) {
      const lagD = (fs.statSync(localGit).mtimeMs - fs.statSync(g).mtimeMs) / 86400000
      if (lagD > 0.5) warn(`备份落后本地约 ${lagD.toFixed(1)} 天——要手动跑 robocopy`)
      else ok('和本地差不多同步')
    }
  } else warn('目录在，但没有 .git——备份不完整')
}

// [4] 素材
console.log('[4] 归档素材')
const arc = path.join(VAULT, '归档')
const chunks = fs.readdirSync(arc).filter((f) => /^chunk-\d+\.txt$/.test(f))
const notes = fs.readdirSync(path.join(arc, 'notes')).filter((f) => f.endsWith('.md'))
const entries = fs.readdirSync(path.join(VAULT, '条目')).filter((f) => f.endsWith('.md'))
const newest = chunks.map((f) => ({ f, m: fs.statSync(path.join(arc, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0]
console.log(`  chunk ${chunks.length} 个（最新 ${newest ? newest.f : '-'}）· 笔记 ${notes.length} 篇 · 条目 ${entries.length} 条`)
console.log('  下一步：按 怎么归档.md 走；判断类的事（并日记、刷看板、commit）不归脚本。')

console.log('')
console.log(bad ? `体检：${bad} 处要处理` : '体检：没发现异常')
process.exit(bad ? 1 : 0)
