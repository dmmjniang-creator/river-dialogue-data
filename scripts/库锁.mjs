/**
 * 库锁
 * 功能：同一时刻只让一个进程动记忆库（归档、同步这些会写的都算）。
 * 为什么：群友那句「握完手手里得已经攥着锁」——抢锁和拿锁必须是同一个动作（openSync 'wx'），
 *   中间留空档，两个进程就会算出同一个 chunk 号、或者一起拍投影，写出半截状态。
 * 数据安全优先于速度（老大 2026-11-08 定的）：抢不到不许硬上，**先等**——
 *   每 2 秒试一次，对方跑完就自动接上，等满才退出码 2。
 * 等多久按重量分（老大 2026-11-08 定的：不是给优先级，是给不同的耐心）：
 *   同步等 2 分钟（投影晚几分钟没事）；归档等 3 分钟（它更重，更不该被挤掉）。
 * 用法：import { 抢锁 } from './库锁.mjs'
 *   抢锁('归档', 180000)     // 传毫秒；不传就是 30 秒兜底
 *   跑完 process.on('exit') 会自动删锁，不用手动放
 * 边界：只写/删记忆库根下的 `.busy.json`，不碰任何数据文件。`--dry` 这类只读的不要抢锁。
 * 最后改：2026-11-08
 */
import fs from 'node:fs'
import path from 'node:path'
import { 记忆库 } from './路径.mjs'

const LOCK = path.join(记忆库, '.busy.json')
const 过期毫秒 = 10 * 60 * 1000   // 正常跑几分钟；超过十分钟就是崩了
const 重试间隔 = 2000

const 睡 = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function 抢锁(谁, 最多等毫秒 = 30000) {
  const 起点 = Date.now()
  const 写 = (fd) => fs.writeSync(fd, JSON.stringify({
    pid: process.pid, 谁, startedAt: new Date().toISOString(), argv: process.argv.slice(2),
  }, null, 2))

  for (;;) {
    try {
      const fd = fs.openSync(LOCK, 'wx')   // wx = 已存在就失败，原子占位
      写(fd)
      fs.closeSync(fd)
      process.on('exit', () => { try { fs.unlinkSync(LOCK) } catch {} })
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }

    let old = null
    try { old = JSON.parse(fs.readFileSync(LOCK, 'utf8')) } catch {}
    const age = old?.startedAt ? Date.now() - Date.parse(old.startedAt) : Infinity
    // 先问那个 pid 还在不在：强杀之后能立刻接管，不必干等
    const 还活着 = (() => {
      if (!Number.isInteger(old?.pid) || old.pid <= 0) return false
      try { process.kill(old.pid, 0); return true } catch { return false }
    })()

    if (!还活着 || age > 过期毫秒) {
      console.log(`接管锁：${old?.谁 ?? '?'}(pid ${old?.pid ?? '?'}) ${还活着 ? `还在但 ${Math.round(age / 60000)} 分钟没动静` : '已经不在了'}`)
      try { fs.unlinkSync(LOCK) } catch {}
      continue
    }

    // 对方还活着：等，不硬上
    const 等了 = Date.now() - 起点
    if (等了 >= 最多等毫秒) {
      console.error(`● 等了 ${Math.round(等了 / 1000)} 秒，记忆库还被占着：${old.谁}（pid ${old.pid}）。`)
      console.error(`  这一轮先不动，下次再来；确认那个进程死了就删掉它：${LOCK}`)
      process.exit(2)
    }
    if (等了 === 0) console.log(`记忆库正被 ${old.谁}(pid ${old.pid}) 用着，等着…`)
    else if (等了 % 10000 === 0) console.log(`  还在等（${Math.round(等了 / 1000)} 秒）…`)
    睡(重试间隔)
  }
}
