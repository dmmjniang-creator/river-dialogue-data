#!/usr/bin/env node
/**
 * 记忆归档 · 提取
 * 从 DSH 会话记录里切出「增量对话」，写成 chunk-XX.txt，并推进游标。
 * 同时把这一段的思维链切出来，写成 归档\思维\chunk-XX.md。
 *
 * 用法：
 *   node 提取.mjs            切下一块
 *   node 提取.mjs --max 20   只切 20 条消息（验证格式用）
 *   node 提取.mjs --dry      只打印，不落盘、不动游标
 *
 * 只取两类记录：
 *   user/message       且 data.source.kind === 'user'   （真人说的话）
 *   assistant/message  且 content 里 type === 'text'    （我说的正文）
 * 另外单独留 reasoning 块（type === 'reasoning'）到思维文件里 —— 那是「黑线」的原料。
 * 时间上下文、技能目录、记忆注入、定时触发一律跳过。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { 根, 记忆库, 找会话目录 } from '../路径.mjs'

const VAULT = 记忆库
const ARCHIVE = path.join(VAULT, '归档')
const CURSOR_FILE = path.join(ARCHIVE, '游标.json')

function decompressFrames(file) {
  const b = fs.readFileSync(file)
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  let i = b.indexOf(magic)
  while (i !== -1) { starts.push(i); i = b.indexOf(magic, i + 1) }
  starts.push(b.length)
  const out = []
  for (let k = 0; k < starts.length - 1; k++) {
    for (let span = 1; span <= 4 && k + span < starts.length; span++) {
      try {
        out.push(zlib.zstdDecompressSync(b.subarray(starts[k], starts[k + span])).toString('utf8'))
        k += span - 1
        break
      } catch {}
    }
  }
  return out.join('')
}

function findSession(wantId) {
  const found = []
  for (const 目录 of 找会话目录()) {
    const f = path.join(目录, 'session.v4.jsonl.zstd')
    if (!fs.existsSync(f)) continue
    const head = decompressFrames(f).split('\n')[0]
    try {
      const o = JSON.parse(head)
      if (o.type === 'session' && o.cwd === 根) {
        found.push({ id: o.id, file: f, mtime: fs.statSync(f).mtimeMs, 条数: collectMessages(f).msgs.length })
      }
    } catch {}
  }
  if (!found.length) throw new Error(`没找到 ${根} 的会话记录`)
  // 只认有正文的会话：重启会留一堆 3 行的空壳，别被它们骗过去
  const 有内容 = found.filter((x) => x.条数 > 0)
  const 池 = 有内容.length ? 有内容 : found
  // 永远跟「最新的那个会话」走。换会话以后 seq 会从头算，所以不能拿旧游标的 lastSeq 去比
  const 最新 = 池.sort((a, b) => b.mtime - a.mtime)[0]
  if (wantId && wantId === 最新.id) return 最新
  return 最新
}

// 每条记录顶层有 time（epoch 毫秒），折成本地 MM-DD HH:mm，写进 chunk 的【seq ROLE 时间】
function localStamp(ms) {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n').trim()
}

/** 思维块：content 里 type === 'reasoning' 的那些 text。空串（只有 signature）跳过。 */
function reasoningOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((c) => c && c.type === 'reasoning' && typeof c.text === 'string' && c.text.trim())
    .map((c) => c.text.trim())
    .join('\n\n')
}

function collectMessages(file) {
  const msgs = []
  const 思维 = []
  for (const line of decompressFrames(file).split('\n')) {
    if (!line) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.type === 'user/message') {
      if (o.data?.source?.kind !== 'user') continue
      const t = textOf(o.data.content)
      if (t) msgs.push({ seq: o.seq, at: o.time, role: 'USER', text: t })
    } else if (o.type === 'assistant/message') {
      const content = o.data?.message?.content
      const t = textOf(content)
      const r = reasoningOf(content)
      if (t) msgs.push({ seq: o.seq, at: o.time, role: 'ASSISTANT', text: t })
      if (r) 思维.push({ seq: o.seq, at: o.time, turn: o.data?.turn, step: o.data?.step, text: r })
    }
  }
  msgs.sort((a, b) => a.seq - b.seq)
  思维.sort((a, b) => a.seq - b.seq)
  return { msgs, 思维 }
}

const maxArg = process.argv.indexOf('--max')
const max = maxArg > -1 ? Number(process.argv[maxArg + 1]) : Infinity

const cursor = fs.existsSync(CURSOR_FILE)
  ? JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'))
  : { session: null, lastSeq: -1, chunk: 0 }

const session = findSession(cursor.session)
const { msgs: all, 思维: 全部思维 } = collectMessages(session.file)
// 换会话了：seq 是每个会话各自从 1 数起，旧游标的 lastSeq 不能拿来比
const 换会话了 = session.id !== cursor.session
const 起点 = 换会话了 ? -1 : cursor.lastSeq
const fresh = all.filter((m) => m.seq > 起点).slice(0, max === Infinity ? undefined : max)

if (!fresh.length) {
  console.log('没有新内容。最后 seq =', cursor.lastSeq)
  process.exit(0)
}
if (换会话了) console.log('换会话了：', cursor.session || '(无)', '→', session.id, '（seq 从头切）')

const 末Seq = fresh.at(-1).seq
const 思维 = 全部思维.filter((t) => t.seq > 起点 && t.seq <= 末Seq)

const n = cursor.chunk + 0 + 1
const id = String(n).padStart(2, '0')
fs.mkdirSync(ARCHIVE, { recursive: true })
fs.mkdirSync(path.join(ARCHIVE, 'notes'), { recursive: true })
fs.mkdirSync(path.join(ARCHIVE, '思维'), { recursive: true })

const head = [
  `# chunk-${id}`,
  `session: ${session.id}`,
  `seq: ${fresh[0].seq}..${末Seq}`,
  `messages: ${fresh.length}`,
  `时间: ${localStamp(fresh[0].at) || '?'} .. ${localStamp(fresh.at(-1).at) || '?'}（本地）`,
  `生成于: ${new Date().toISOString()}`,
  '',
].join('\n')

const body = fresh.map((m) => {
  const at = localStamp(m.at)
  return `【${m.seq} ${m.role}${at ? ' ' + at : ''}】 ${m.text.replace(/\n{3,}/g, '\n\n')}`
}).join('\n\n')

const 思维头 = [
  `# chunk-${id} · 思维链`,
  '',
  `> 这一份是原料，不是成品。原样保留 reasoning 原文，没挑没删。`,
  `> 要画「黑线」的话，人工挑出否掉、改口、克制那几句另存；这里只保证不丢。`,
  '',
  `- session: ${session.id}`,
  `- seq: ${fresh[0].seq}..${末Seq}`,
  `- messages: ${fresh.length}（其中带思维链的 ${思维.length} 条）`,
  `- 时间: ${localStamp(fresh[0].at) || '?'} .. ${localStamp(fresh.at(-1).at) || '?'}（本地）`,
  `- 生成于: ${new Date().toISOString()}`,
  '',
  '---',
  '',
].join('\n')

const 思维体 = 思维.map((t) => {
  const at = localStamp(t.at)
  const where = t.turn != null ? ` · turn ${t.turn}/step ${t.step}` : ''
  return `### seq=${t.seq}${at ? ' · ' + at : ''}${where}\n\n${t.text.replace(/\n{3,}/g, '\n\n')}\n`
}).join('\n')

if (process.argv.includes('--dry')) {
  console.log('--dry：只打印，不写文件、不动游标\n')
  console.log(head + body.slice(0, 800) + '\n…')
  console.log('\n（正文', fresh.length, '条，字符', body.length, '）')
  console.log('（思维链', 思维.length, '条，字符', 思维体.length, '）')
  console.log('\n--- 思维链前 800 字 ---\n' + 思维体.slice(0, 800))
  process.exit(0)
}

const chunkPath = path.join(ARCHIVE, `chunk-${id}.txt`)
fs.writeFileSync(chunkPath, head + body + '\n', 'utf8')

const 思维Path = path.join(ARCHIVE, '思维', `chunk-${id}.md`)
fs.writeFileSync(思维Path, 思维头 + 思维体 + '\n', 'utf8')

fs.writeFileSync(CURSOR_FILE, JSON.stringify({
  ...cursor,
  session: session.id,
  lastSeq: 末Seq,
  chunk: n,
  updatedAt: new Date().toISOString(),
}, null, 2), 'utf8')

console.log('写入', chunkPath)
console.log('写入', 思维Path)
console.log('消息', fresh.length, 'seq', fresh[0].seq, '->', 末Seq)
console.log('正文', body.length, '字；思维链', 思维.length, '条', 思维体.length, '字')
console.log('会话总消息', all.length, '剩余未归档', all.filter((m) => m.seq > 末Seq).length)
console.log('（基线不在这里刷，收尾跑 基线.mjs）')
