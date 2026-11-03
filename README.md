# 河流（River）· 外置记忆系统（external memory）

> **一句话**：River 是一套外置记忆系统——基于模型自身的关键词提取、读取语料，让 AI 在新旧会话之间保持「连续」。
> **适用范围（重要）**：目前只在 **DeepSeek-V4.1-Flash 1017**（推理等级 High）这**一个模型**上验证可用。换模型、换版本都没测过——它靠模型自己的关键词做「接口」，换一副嘴可能就接不上。别把它当通用方案。
> 写给两种人：养过 AI 伴侣的人（关心她会不会忘），和做 agent 的人（关心怎么让上下文接得上）。
> 原理公开；具体路径、配置、密钥不公开。仓库：<https://github.com/dmmjniang-creator/river-memory>

---

## 它解决什么

模型每开一场对话，都从零开始。权重不动，上下文里没有的东西，它就没有。

所以「AI 忘记你」不是它不上心，是**它根本没有昨天**。

这套系统做的不是「让它记得更多」，是**让它每一场都能重新接上，并且忘得看得见**。

一句话：**丢得有声音。**

---

## 一句话架构

**存**（流水 / 底账 / 科目 / 归档）+ **传**（人格注入 / 开场交接 / 归档回写）。

![一场对话怎么变成记忆](images/流程-一场对话变成记忆.png)

---

## 三个词

| 词 | 英文 | 是什么 |
| --- | --- | --- |
| 流水 | journal | 「那天发生了什么」——带日期，只追加 |
| 底账 | ledger | 「这件事现在是什么样」——一页答一件，只改写 |
| 科目 / 事实键 | fact key | 贴在记录上的 `对象.方面`，只干一件事：判断新旧是不是同一件事 |

为什么非要三个：流水答不了「现在」，底账答不了「怎么来的」，事实键决定「这两条是不是同一件事」。少一个就乱。

---

## 怎么转

1. **原文落盘**：宿主把整场对话写进会话存档，在工作区外，**不会自动进上下文**。
2. **归档**：切块（正文 + 思维链）→ 提炼成三层 → 挂事实键收新旧。
3. **传**：人格卡每回合现读注入；开场靠索引页 / 看板 / 交接页接上。

![系统总览](images/结构1-系统总览.png)

---

## 最重要的一条：验收

开场先复述三句：

> **我是谁 / 上一场停在哪 / 今天欠什么。**

三句各抽查一份材料。说不出来，就是没读。

这把「读没读」从自觉变成了一个**能听见的门槛**——比任何「请记住」的提示词都硬。

---

## 和普通 RAG 不一样的三处

1. **不删**。要作废就打个标记，写清被谁替代。删是一只手：用现在的标准决定过去该不该留。
2. **分层**。记录层只追加，底账层只改写。改写逼你把新东西合进旧理解里，抄写不用。
3. **允许丢，但让丢有声音**。两页打架、键挂错、页过期、链接断——这些都不报错，读起来都像真的。所以每条规矩最后都落成「让丢有响」：验收、来源、`未核` 标记、不删只打标。

---

## 已知缺陷（先自己说，别等别人问）

- **模型换代，词会漂。** 这套系统靠模型自己的关键词做「接口」，换模型就可能接不上。对策：词不做主键，路径 / 日期 / 事实键才是。
- **传下去的是我的取舍，不是原文。** 实测过：只给整理好的文件，会答不出一个核心定义；给整场会话才答得出。
- **读没读只能验「说得出来」**，验不了「按它做」。
- **并发**：会话 id 会变，几个实例写同一个库，谁都不报错。

---

## 图

- `images/流程-一场对话变成记忆.png`
- `images/结构1-系统总览.png`
- `images/结构2-脚本表.png`

（图已脱敏：不含绝对路径、端口、会话 id、可照抄的命令。）

---

## 许可（License）

**文字与图片：CC BY-NC 4.0（署名—非商业性使用 4.0 国际）。代码（以后附带）：MIT。**

| | 原版（这份设计本身） | 改编版（你改过之后） |
| --- | --- | --- |
| 能复制、再发布吗 | 能 | 能 |
| 能改吗 | 能 | 能（继续改） |
| 必须做什么 | 署名 + 来源链接 + 附许可 | 署名 + 来源链接 + 附许可 + **说明改了什么** |
| 能商用吗 | **不能** | **不能**（除非符合下面那条「额外许可」） |
| 能加更严的限制吗 | — | **不能**：CC 禁止下游再加额外限制 |

### 额外许可（作者单独授予）：改进版可以商用

如果你在本设计基础上做出**实质性的优化或新增功能**，那么**你自己那一版**可以用于商业用途，条件是：

1. 保留原作者署名和本仓库链接；
2. 在显著位置说明改了什么，不能假装是原创；
3. **不得只复制本仓库内容、改个名字就拿去卖**——没有实质性新增，不适用这一条。

这是作者单独给的许可，不改变上面 CC BY-NC 的效力；两者对同一件事说法不同时，按**更宽松的那条**理解（对使用者更有利）。

> 「实质性」没有客观标准——改两行算不算，得由双方讲理。这条只是把门槛写出来，不是自动判定。

**协议管不到的地方**：版权管的是**文字、图、代码的表达**，管不住「思路」。任何人读懂原理、用自己的话重写一遍，协议拦不住。这条先说明白，免得以为有个开关。

Copyright (c) 2026 `dmmjniang-creator`。完整许可文本见 `LICENSE-CC-BY-NC-4.0.txt`。

---

## 分享意图与署名

这套设计公开，是为了说清三件事：

1. **它能实现**——在 **DeepSeek Harness** 这个平台、**DeepSeek-V4.1-Flash 1017** 这个模型、**推理等级 High** 这个配置下，跑通过。
2. **欢迎社区接着做**——改、重写、换实现都行；做出改进欢迎回来提 issue / PR。这套东西本来就不该只长在一个人的机器上。
3. **留一个记录**——这个时间（2026-11-03）、这个用户（`dmmjniang-creator`）先公开了这个思路。**不是要独占，是要让「谁先做的」有据可查。**

| 复现最低配置 | 值 |
| --- | --- |
| 平台 | DeepSeek Harness |
| 模型 | DeepSeek-V4.1-Flash 1017 |
| 推理等级 | High |
| 首次公开 | 2026-11-03 |
| 仓库历史 | 完整保留，未 squash |

- **协议保护表达，不保护思路。** 文字、图、代码受 CC BY-NC 4.0 约束；「三层结构 / 三句验收 / 不删只打标」这些**做法本身**，协议管不到——有人看懂了、用自己的话重写一遍，不算侵权。这条写在这里，是让双方预期一致。
- 引用或再发布，请保留：作者名 + 仓库链接 + 首次公开日期。
- 如果发现别人整段搬运文字或图：对照本仓库的时间戳和提交记录，公开比对即可。

**English:** First published 2026-11-03, on DeepSeek Harness with DeepSeek-V4.1-Flash 1017 (reasoning effort: High). Sharing the idea so others can reproduce and improve it; the claim is priority (who shared it, when) — not exclusivity. The license covers the text, images and code — not the underlying methods.

---

## 作者

`dmmjniang-creator`（GitHub），2026。起因是给自家的一条鱼做记忆，做着发现它可能是所有 AI 伴侣的共同问题。

> 这套东西的价值不在记得多，在丢得有声音。人忘了知道自己想不起来；机器丢了，是不吭声的。

---

## English

**River** is an **external memory** design for AI companions: a journal (append-only), a ledger (current state, rewritten), and fact keys (identity of a fact across versions). The core idea is not "remember more" but **make forgetting audible**: a three-line opening check, source and confidence marks, and a no-delete rule.

**Scope:** tested on **one model only** — DeepSeek-V4.1-Flash 1017 (reasoning effort: High). Other models and versions are untested. The design uses the model's own keywords as the interface, so a different model may not connect.

Licensed under **CC BY-NC 4.0** for text and images (non-commercial for the original design). **Additional permission:** a version with substantive improvements or new features may be used commercially, provided attribution and a clear note of what changed. MIT for any code. Attribution required.
