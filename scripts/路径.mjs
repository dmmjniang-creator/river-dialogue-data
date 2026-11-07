/**
 * 路径
 * 功能：所有脚本读路径的唯一入口。
 * 目的：脚本里散着写死的绝对路径——换机器跑不起来，公开时还会露出本机目录。
 * 用法：import { 根, 记忆库, 产出 } from './路径.mjs'
 * 边界：只读环境变量 RIVER_ROOT（可选），不改任何文件、不联网。
 * 最后改：2026-11-06
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import fs from 'node:fs'

const 本文件 = fileURLToPath(import.meta.url)
export const 工具目录 = dirname(本文件)
// scripts/ 的上一级就是工作区根；换机器时设 RIVER_ROOT 覆盖
export const 根 = process.env.RIVER_ROOT || dirname(工具目录)
export const 记忆库 = join(根, '记忆库')
export const 产出 = join(根, '产出')
export const 归档 = join(记忆库, '归档')
export const 文档 = join(工具目录, '文档')

// DSH 家目录：默认 ~/.dsh，可用 DSH_HOME 覆盖
export const DSH家 = process.env.DSH_HOME || join(homedir(), '.dsh')
export const 会话根 = join(DSH家, 'sessions')

/**
 * 找出所有「会话目录」（里面直接有 session.v4.jsonl.zstd 的那一层）。
 * 以前写死 `sessions\--D-~804A~5929--`——那是本机工作区路径的编码，换机器必错，公开还露位置。
 * 现在扫 sessions 下两层，谁有会话文件算谁。
 */
export function 找会话目录(root = 会话根, 深 = 2) {
  const out = []
  let 条目
  try { 条目 = fs.readdirSync(root, { withFileTypes: true }) } catch { return out }
  for (const d of 条目) {
    if (!d.isDirectory()) continue
    const p = join(root, d.name)
    if (fs.existsSync(join(p, 'session.v4.jsonl.zstd'))) out.push(p)
    else if (深 > 0) out.push(...找会话目录(p, 深 - 1))
  }
  return out
}
