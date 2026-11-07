#!/usr/bin/env node
/**
 * 记忆归档 · 旧档案出候选
 *
 * 把躺着没人看的 markdown（归档 notes、旧笔记）扫成「候选记忆」，一条一行，
 * 交给人和 AI 按条目的字段整理：记忆|日期|重要度|事实键。
 * 认不出就留空 —— 尤其事实键，猜错会把不相干的事串成一条链。
 *
 *   node 候选.mjs                 扫默认目录，写到 归档\候选-<今天>.md
 *   node 候选.mjs --dir 某目录     换目录
 *   node 候选.mjs --max 40        每篇最多取几行
 *
 * 只产候选，不写条目。挑哪条、怎么写，是人 / AI 的事。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 这里 = path.dirname(fileURLToPath(import.meta.url))
const 归档 = path.resolve(这里, '..', '..', '记忆库', '归档')
const 参数 = process.argv.slice(2)
const 取参 = (名, 兜底) => {
  const i = 参数.indexOf(名)
  return i > -1 && 参数[i + 1] ? 参数[i + 1] : 兜底
}
const 目录 = path.resolve(取参('--dir', path.join(归档, 'notes')))
const 每篇上限 = Number(取参('--max', 30)) || 30

const 跳过 = /^(#|>|\||\s*$|```)/
const 行们 = []
const 文件们 = fs.existsSync(目录) ? fs.readdirSync(目录).filter((f) => f.endsWith('.md')) : []
for (const f of 文件们) {
  const p = path.join(目录, f)
  const 正文 = fs.readFileSync(p, 'utf8')
  const 日期 = (/(\d{4}-\d{2}-\d{2})/.exec(f + '\n' + 正文.slice(0, 400)) || [])[1] || ''
  let n = 0
  for (const 行 of 正文.split('\n')) {
    if (跳过.test(行)) continue
    const 句 = 行.replace(/^[-*]\s*/, '').replace(/（?seq[^)）]*[)）]?/g, '').trim()
    if (句.length < 8) continue
    行们.push({ 来源: f, 日期, 句 })
    n += 1
    if (n >= 每篇上限) break
  }
}

// 近重复先粗去一下：前 12 个字一样的只留一条
const 见过 = new Set()
const 去重 = 行们.filter((x) => {
  const k = x.句.slice(0, 12)
  if (见过.has(k)) return false
  见过.add(k)
  return true
})

const 今天 = new Date().toISOString().slice(0, 10)
const 出 = path.join(归档, `候选-${今天}.md`)
const 头 = [
  `# 旧档案候选（${今天}）`,
  '',
  '> 从 `' + path.relative(path.resolve(这里, '..', '..'), 目录) + '` 扫出来的，共 ' + 去重.length + ' 条候选。',
  '> 挑的时候按六格写：**记忆|检索词|日期|重要度|事实键**；认不出的格子留空，别猜。',
  '> 事实键的写法是「对象.方面」，像 `鱼塘.语料条数`、`插件.版本`。',
  '',
  '| # | 来源 | 日期 | 候选 |',
  '| --- | --- | --- | --- |',
]
去重.forEach((x, i) => {
  头.push(`| ${i + 1} | ${x.来源} | ${x.日期 || ''} | ${x.句.replace(/\|/g, '\\|')} |`)
})
fs.writeFileSync(出, 头.join('\n') + '\n', 'utf8')
console.log(`扫了 ${文件们.length} 篇 → 候选 ${去重.length} 条`)
console.log('写到', 出)
