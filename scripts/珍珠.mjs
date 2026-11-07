// 珍珠账本：数条数、算字数，提醒该整理还是该压缩
// 用法：node 珍珠.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { 记忆库 } from './路径.mjs'

const FILE = join(记忆库, '人物', '珍珠.md')
const MAX_COUNT = 100
const MAX_CHARS = 6000

const text = readFileSync(FILE, 'utf8')
const 条 = text.split(/\r?\n/).filter((l) => /^\s*-\s*\d{4}-\d{2}-\d{2}/.test(l))
const 字数 = [...text].length

console.log(`条数 ${条.length} / ${MAX_COUNT}`)
console.log(`字数 ${字数} / ${MAX_CHARS}`)
if (条.length >= MAX_COUNT) console.log('→ 该整理了：把旧的 + 这一百条重排一遍，丢不重要的，合并同类。')
else console.log(`→ 还差 ${MAX_COUNT - 条.length} 条。`)
if (字数 > MAX_CHARS) console.log('→ 该压了：压到 6000 以内。')
