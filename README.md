# OpenAthor

OpenAthor 是一个面向 Pi Agent 的小说创作工具链，目标是让用户在自己熟悉的文本编辑器中写作，并通过 Pi Agent 完成小说项目的规划、续写、审稿、改稿和设定维护。

当前项目已完成 Slice 1 协议内核，并正在补齐 Slice 2 写作闭环、Slice 3 结构编辑、Slice 4 长篇检索和 LLM-as-judge 回归体系。TypeScript/Node.js CLI 可以创建、接管、检查 OpenAthor 项目，从明文事实源重建派生 SQLite 索引，并为已落地场景生成 judge evidence package。

## 产品方向

OpenAthor 当前产品轨道不做自研 TUI，也不做网页编辑器。核心产品形态是：

```text
用户自选文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + OpenAthor Project Protocol
```

用户可以使用 VSCode、Obsidian、Typora、Neovim、Zed 等编辑器管理正文和设定文件；Pi Agent 作为智能助手，通过 OpenAthor Skill 调用 OpenAthor CLI。

## 核心目标

- 支持从零创建小说项目
- 支持非侵入式接管已经写了一半的小说
- 维护长期一致的 canon、人物、时间线和伏笔
- 让 Pi Agent 基于结构化上下文继续写作
- 所有重要修改尽量以 diff 呈现
- 保持本地优先，用户始终拥有自己的文本文件

## 当前状态

当前可用命令：

```bash
npm test
npm run build
node dist/cli.js init <path> --title "小说名" --json
node dist/cli.js adopt <path> --dry-run --json
node dist/cli.js adopt <path> --json
node dist/cli.js doctor --json
node dist/cli.js index rebuild --json
node dist/cli.js context chapter 1 --json
node dist/cli.js outline show --json
node dist/cli.js outline impact 1 --json
node dist/cli.js outline insert --after 1 --title "插入章" --confirm --json
node dist/cli.js outline move 1 --after 2 --confirm --json
node dist/cli.js outline split 1 --at-line 12 --title-before "前半章" --title-after "后半章" --confirm --base-hash "sha256:..." --json
node dist/cli.js outline merge 1 2 --title "合并章" --json
node dist/cli.js outline merge 1 2 --title "合并章" --confirm --base-hash "sha256:..." --next-base-hash "sha256:..." --json
node dist/cli.js outline replan --from 3 --task "重规划后续剧情" --json
node dist/cli.js outline replan --from 3 --task "重规划后续剧情" --from-package notes/replan-package.yaml --confirm --base-hash "sha256:..." --json
node dist/cli.js outline archive 1 --confirm --base-hash "sha256:..." --json
node dist/cli.js search text "关键词" --json
node dist/cli.js search related chapter 1 --json
node dist/cli.js index rebuild --vector --json
node dist/cli.js search semantic "旧案钥匙 父亲" --json
node dist/cli.js assets audit --json
node dist/cli.js assets sync chapter 1 --from notes/asset-package.yaml --json
node dist/cli.js assets sync chapter 1 --from notes/asset-package.yaml --confirm --base-hash "sha256:..." --assets-hash "bible/characters.md=sha256:..." --assets-hash "outline/chapters.yaml=sha256:..." --json
node dist/cli.js style analyze style/samples/sample-001.md --json
node dist/cli.js style profile show --json
node dist/cli.js style check chapter 1 --json
node dist/cli.js style revise chapter 1 --goal "压低直白说明" --json
node dist/cli.js style revise chapter 1 --goal "压低直白说明" --text "# 第一章\n\n修订正文。" --base-hash "sha256:..." --confirm-write --json
node dist/cli.js review chapter 1 --task "检查人物动机" --json
node dist/cli.js draft chapter next --task "写下一章" --text "# 第二章\n\n正文。" --confirm-write --json
node dist/cli.js revise chapter 1 --task "确认改写" --text "# 第一章\n\n新正文。" --base-hash "sha256:..." --confirm-write --json
node dist/cli.js canon sync 1 --task "提取新增设定到 pending" --json
node dist/cli.js skill install pi --json
node dist/fixture-check.js fixtures/slice-1/adopt-3-chapters --json
node dist/judge-smoke.js --json
```

当前仓库包含产品文档、协议 schema、CLI 实现、fixture 回归样例和 LLM-as-judge smoke：

```text
docs/
  index.md
  pre-development.md
  pre-development/
  product-shape-pi-agent.md
  product-shape-pi-agent/
  project-protocol.md
  project-protocol/
  cli-contract.md
  cli-contract/
  decisions.md
  decisions/
.codex/
  skills/
schemas/
src/
fixtures/
AGENTS.md
```

## 文档入口

- [文档总入口](docs/index.md)
- [前期准备](docs/pre-development.md)
- [Pi Agent 优先产品形态](docs/product-shape-pi-agent.md)
- [项目协议](docs/project-protocol.md)
- [CLI 合约](docs/cli-contract.md)
- [产品和架构决策](docs/decisions.md)

## 开发原则

当前实现覆盖 Slice 1 协议内核、Slice 2 的只读 `context` 入口、plan/draft/review/revise/canon sync 的 proposal 入口、确认后的“下一章”安全写入、带 `--base-hash` 冲突保护的已有章节确认改写、确定性 `style analyze/profile show/check`、`style revise` proposal/diff/hash-confirm 写入、结构编辑 show/impact/insert/move/split/merge/replan/archive 最小闭环、文本/相关/semantic 检索、长篇资产 audit、写作后结构化资产 sync，以及 `openathor-judge-smoke` evidence package 自动化。CLI 不调用模型写正文，不做 sub-agent 调度；`assets sync` 接收 agent/用户提供的结构化资产包并负责 pending/确认写入、hash gate 和 run 记录，confirmed sync 会追加新资产并合并更新既有人物、时间线和伏笔资产，确认时必须同时匹配章节 hash 和 proposal 输出的资产源 hashes；多章写作回归要求每章正文确认写入后同步人物、事件、伏笔和 outline links，再用 `assets audit` 验证无 unresolved link、character link drift 和 summary drift；`style analyze` 只生成 pending 抽象画像，不复制参考文本原文；`style revise` 不生成修订正文，只 hash-gate 外部生成的修订文本；`search semantic` 使用本地可重建派生向量索引，真实 LLM judge scores 只作为本地/手动评估证据保存，不进入必跑 CI。进入后续产品切片前，仍需保持以下追溯关系：

- 产品形态
- 目标用户故事
- OpenAthor 项目协议
- CLI 命令合约
- Pi Skill 行为规范
- 接管已有小说流程
- 验收样例和测试夹具策略
- 产品和架构防偏移规则

## 贡献说明

贡献前请先阅读 [AGENTS.md](AGENTS.md)。当前阶段的主要贡献方向是完善产品文档、项目协议、CLI 合约、目标验收场景和防偏移规则。
