#!/usr/bin/env node
/**
 * 记忆同步
 * 功能：① 把 `记忆库\` 里的 md 平铺到世界线的 `diary\`，让 memory_find 搜得到；② 查日记双写有没有断。
 * 为什么：memory_find 只扫 diary 下一层（dsh-world/lib/memoryFiles.js），不递归；记忆库是子目录结构。
 * 边界：
 *   - **日记不碰**：`记忆库\日记\` 不进投影，`diary\YYYY-MM-DD.md` 只归我写，脚本绝不覆盖。
 *   - 日记只**单向**同步：`diary\` → `记忆库\日记\`（我写的那份是主），永不反向。
 *   - 不删东西；`--prune` 才清理已经映射不回源的投影文件。
 *   - 不碰 `.git`、`.obsidian`，不投影 `归档\思维\chunk-*.md` 原文块和 `钩子.md`（太大，会淹检索）。
 * 用法：node 记忆同步.mjs [--dry] [--prune] [--日记同步]
 * 退出码：日记两边对不上时 1，否则 0（当检查用）。
 * 最后改：2026-11-08
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { 根, 记忆库 } from './路径.mjs'
import { 抢锁 } from './库锁.mjs'

const 世界线 = path.dirname(根)
const diaryDir = path.join(世界线, 'diary')
const dry = process.argv.includes('--dry')
const prune = process.argv.includes('--prune')
const 日记同步 = process.argv.includes('--日记同步')

const 跳过目录 = new Set(['.git', '.obsidian', '日记'])
const 跳过相对 = [/^归档[\\/]思维[\\/]chunk-\d+\.md$/i, /^归档[\\/]思维[\\/]钩子\.md$/i]
const 投影前缀 = /^(底账|条目|人物|结构|模板|事件|关键词|学习笔记|归档)-/
const 日记名 = /^\d{4}-\d{2}-\d{2}\.md$/

const 映射 = (rel) => rel.split(/[\\/]/).join('-')

function 收集(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!跳过目录.has(e.name)) 收集(p, out); continue }
    if (!e.name.endsWith('.md')) continue
    const rel = path.relative(记忆库, p)
    if (跳过相对.some((re) => re.test(rel))) continue
    out.push({ src: p, rel, name: 映射(rel) })
  }
  return out
}

if (!fs.existsSync(记忆库)) { console.error('找不到记忆库：', 记忆库); process.exit(1) }
if (!fs.existsSync(diaryDir)) { console.error('找不到 diary：', diaryDir); process.exit(1) }

// ---- 一、投影 ----
// 写投影之前先占住库：跟归档共用一把锁（见 库锁.mjs）
if (!dry) 抢锁('同步', 120000)   // 同步轻，等 2 分钟就够

const 源 = 收集(记忆库)
let 写出 = 0, 未变 = 0
for (const f of 源) {
  const dst = path.join(diaryDir, f.name)
  const same = fs.existsSync(dst) && fs.readFileSync(dst).equals(fs.readFileSync(f.src))
  if (same) { 未变++; continue }
  if (!dry) fs.copyFileSync(f.src, dst)
  写出++
}

const 源名 = new Set(源.map((f) => f.name))
const 孤儿 = fs.readdirSync(diaryDir).filter((n) => n.endsWith('.md') && 投影前缀.test(n) && !源名.has(n))
if (prune) for (const n of 孤儿) if (!dry) fs.unlinkSync(path.join(diaryDir, n))

// ---- 二、日记双写 ----
const 库日记目录 = path.join(记忆库, '日记')
const 列日记 = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => 日记名.test(n)) : [])
const 有日记 = { diary: 列日记(diaryDir), 库: 列日记(库日记目录) }
const S1 = new Set(有日记.diary), S2 = new Set(有日记.库)
const 只diary = 有日记.diary.filter((n) => !S2.has(n))
const 只库 = 有日记.库.filter((n) => !S1.has(n))
const 不一致 = 有日记.diary.filter((n) => S2.has(n)
  && !fs.readFileSync(path.join(diaryDir, n)).equals(fs.readFileSync(path.join(库日记目录, n))))

if (日记同步) {
  for (const n of [...只diary, ...不一致]) {
    if (!dry) fs.copyFileSync(path.join(diaryDir, n), path.join(库日记目录, n))
  }
}

console.log(`${dry ? '[预览] ' : ''}投影 ${源.length} 个：写出 ${写出}，未变 ${未变}`)
console.log(孤儿.length
  ? `孤儿投影 ${孤儿.length} 个${prune ? (dry ? '（预览，未删）' : '，已删') : '（未删，加 --prune 才清）'}：\n  ` + 孤儿.join('\n  ')
  : '孤儿投影 0 个')

// 修完再看一眼：退出码要反映修完之后的真实状态，不是修之前
const 还为坏 = 日记同步 && !dry
  ? 有日记.diary.filter((n) => {
      const p = path.join(库日记目录, n)
      return !fs.existsSync(p) || !fs.readFileSync(p).equals(fs.readFileSync(path.join(diaryDir, n)))
    }).length + 只库.length
  : 只diary.length + 只库.length + 不一致.length
// ---- 三、容量闸：dsh-world 只读 diary 一层，单文件 2 MB / 一层 2000 个，超了就不读 ----
const MAX_FILE = 2 * 1024 * 1024, MAX_FILES = 2000
const 层文件 = fs.readdirSync(diaryDir).filter((n) => /\.(md|txt)$/i.test(n))
const 层最大 = 层文件.reduce((a, n) => Math.max(a, fs.statSync(path.join(diaryDir, n)).size), 0)
const 容量预警 = []
if (层最大 > MAX_FILE * 0.75) 容量预警.push(`diary 最大单文件 ${(层最大 / 1048576).toFixed(2)} MB（上限 2 MB）——超了 memory_find 不读`)
if (层文件.length > MAX_FILES * 0.75) 容量预警.push(`diary 一层 ${层文件.length} 个文件（上限 2000）——超了后面的不读`)

const 日记坏 = 还为坏
if (!日记坏) console.log(`日记 ${有日记.diary.length} 天，两边对得上`)
else {
  console.log(`日记 ${有日记.diary.length} 天，对不上的 ${日记坏} 处：`)
  if (只diary.length) console.log(`  diary 有、库缺 ${只diary.length}：${只diary.join(' ')}${日记同步 ? (dry ? '（预览：会补到库）' : '（已补到库）') : '（--日记同步 会补到库）'}`)
  if (不一致.length) console.log(`  两边内容不同 ${不一致.length}：${不一致.join(' ')}${日记同步 ? (dry ? '（预览：会用 diary 覆盖库）' : '（已用 diary 覆盖库）') : '（--日记同步 会用 diary 覆盖库）'}`)
  if (只库.length) console.log(`  库有、diary 缺 ${只库.length}：${只库.join(' ')}——这个脚本不补，要人工合`)
}

console.log(容量预警.length ? `容量警报 ${容量预警.length} 条：\n  ` + 容量预警.join('\n  ') : `容量：diary 一层 ${层文件.length} 个文件，最大 ${(层最大 / 1024).toFixed(0)} KB（上限 2000 个 / 2 MB）`)

// ---- 四、顺手提交（--commit）：md 改了就落盘，没有「保存」这一步，所以每收一次工就留一版 ----
if (process.argv.includes('--commit')) {
  const git = (...a) => spawnSync('git', ['-C', 记忆库, ...a], { stdio: 'ignore' }).status
  if (!fs.existsSync(path.join(记忆库, '.git'))) console.log('不是 git 仓库，跳过提交')
  else {
    git('add', '-A')
    if (git('diff', '--cached', '--quiet') === 1) {
      // sv-SE 的格式正好是 YYYY-MM-DD HH:mm:ss，时间戳一律带年（老大 11-08 提的：不带年跨年就乱）
      const 时间 = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const msg = `记忆同步 ${时间}`
      console.log(git('commit', '-q', '-m', msg) === 0 ? `已提交：${msg}` : '提交失败，改动还在工作区')
    } else console.log('无改动，不用提交')
  }
}

process.exit(日记坏 || 容量预警.length ? 1 : 0)
