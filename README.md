# OpenAthor

[![CI](https://github.com/huanghuoguoguo/openathor/actions/workflows/ci.yml/badge.svg)](https://github.com/huanghuoguoguo/openathor/actions/workflows/ci.yml)

OpenAthor 是一个面向 Pi Agent 的小说创作平台 + CLI 工程化工具链。它把小说正文、大纲、人物、设定、时间线、伏笔、风格画像等创作资产组织成 agent 可理解、可验证、可安全修改的明文工程，让 Pi Agent 能辅助规划、续写、审稿、改稿和资产维护。

公开仓库：https://github.com/huanghuoguoguo/openathor

## 这是什么

很多 AI 写作工具能生成一段文字，但很难稳定维护一个持续创作中的小说项目：前文事实会遗忘，人物状态会漂移，插章移章会破坏引用，用户手写内容也可能被覆盖。

OpenAthor 的核心思路是把小说项目变成 agent 可理解、可验证、可恢复的明文工程：

```text
用户自己的文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor agent-facing CLI
  + OpenAthor Project Protocol
```

用户继续用 VSCode、Obsidian、Typora、Neovim、Zed 等编辑器写正文。Pi Agent 通过 OpenAthor Skill 调用 CLI，CLI 负责确定性项目操作、上下文打包、安全写入、索引重建和回归验证。

OpenAthor 不只服务长篇小说。短篇、中篇、连载、已有半成品和散稿整理都可以使用同一套项目协议；长篇是最容易暴露上下文漂移、资产漂移和结构变更风险的压力测试场景，所以当前验证样例重点覆盖了 30 章接管和多章资产连续性。

## 核心能力

- 从零创建小说项目
- 非侵入式接管已有小说，不移动、不重命名、不改写原稿
- 从散稿目录识别正文、设定、灵感和废稿
- 生成章节上下文包，供 Pi Agent 续写、审稿和改稿
- 用 confirmed canon、人物、时间线和伏笔维护项目一致性
- 插章、移章、拆章、合章、归档和重规划时保留稳定章节 ID
- 支持文本检索、相关检索和本地可重建的 deterministic semantic search
- 支持授权参考文本的抽象 style profile，不复制参考文本原句
- 写作后通过资产包同步人物状态、事件、伏笔、章节摘要和 outline links
- 所有高风险写入报告 `writes`，关键写入使用 source hash 防并发覆盖
- 通过 fixture 和 LLM-as-judge evidence package 做可重复回归验证

## 快速开始

环境要求：

- Node.js >= 22
- curl
- tar

发布版一行安装：

```bash
curl -fsSL https://raw.githubusercontent.com/huanghuoguoguo/openathor/main/scripts/install.sh | sh
openathor --version
```

安装脚本会下载 GitHub Release 中的 `openathor.tar.gz`，安装到 `~/.openathor/current`，并把命令链接到 `~/.local/bin`：

```text
openathor
openathor-fixture-check
openathor-judge-smoke
```

如果 `~/.local/bin` 不在 `PATH` 中，按安装脚本提示加入：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

也可以下载指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/huanghuoguoguo/openathor/main/scripts/install.sh | OPENATHOR_VERSION=v0.1.0 sh
```

源码安装和开发验证：

```bash
git clone https://github.com/huanghuoguoguo/openathor.git
cd openathor
npm ci
npm run build
npm test
```

`npm test` 会运行 TypeScript 类型检查、schema 校验、构建、43 个 deterministic fixture 回归，以及不调用外部模型的 judge smoke。

如果不想使用 `curl | sh`，可以在 GitHub Releases 页面手动下载 `openathor.tar.gz`，解压后直接运行 `dist/cli.js`，或自行建立软链接。

## 5 分钟演示

### 创建一个新小说项目

```bash
node dist/cli.js init data/demo-novel --title "雾港来信" --json
cd data/demo-novel
node ../../dist/cli.js doctor --json
node ../../dist/cli.js skill install pi --json
node ../../dist/cli.js context project --json
```

这会创建标准 OpenAthor 项目结构，并安装项目级 Pi Skill 到：

```text
.pi/skills/openathor/SKILL.md
```

### 接管已有小说目录

在已有稿件目录中运行：

```bash
node /path/to/openathor/dist/cli.js adopt . --dry-run --json
node /path/to/openathor/dist/cli.js adopt . --json
node /path/to/openathor/dist/cli.js index rebuild --json
node /path/to/openathor/dist/cli.js context chapter 1 --json
```

`adopt` 默认非侵入式接管：只建立 OpenAthor 元数据和派生索引，不改写原始正文文件。

### 运行真实项目回归样例

```bash
npm run fixture -- fixtures/slice-4/adopt-30-chapters
npm run fixture -- fixtures/slice-4/style-guided-writing-loop
npm run fixture -- fixtures/slice-4/replan-draft-asset-continuity
```

这些样例覆盖 30 章接管、风格画像写作闭环、重规划后继续写作和创作资产连续性。

## 用了什么

- TypeScript / Node.js 22
- Commander：CLI 命令层
- YAML / Markdown：项目事实源
- AJV：协议 schema 校验
- SQLite 派生索引边界
- 本地 deterministic hash embedding：可重建语义检索索引
- Pi Agent Skill：约束 agent 行为和调用顺序
- LLM-as-judge evidence package：为真实 agent 评估保留证据结构

模型和 API 说明：

- OpenAthor CLI 本身不调用外部模型 API，运行核心功能不需要 `.env` 或 API key。
- 已验证的 Operator 环境是 Pi Agent + GLM-5；模型 provider 和 API key 由 Pi Agent 侧配置，不写入 OpenAthor 仓库。
- 当前版本未集成 Unity2.ai API。README 不虚构未实现依赖；如果赛事要求指定模型/API，可在 OpenAthor 的 Pi Agent 执行层接入，再把 provider 配置写入说明。

## 作品亮点

### 1. 面向完整小说项目，而不是只生成片段

OpenAthor 关注的是一个小说项目的完整生命周期：接管、理解、续写、审稿、改稿、重规划、资产沉淀和导出。长篇是当前重点验证场景，因为它最能检验上下文、人物状态、伏笔和章节结构是否稳定。

### 2. 明文文件是唯一事实源

正文、canon、人物、时间线、风格画像、大纲和章节资产都保存在 Markdown/YAML 中。SQLite 和向量索引只是可重建派生数据，用户不会被锁进黑盒。

### 3. 不覆盖用户原稿

接管已有小说时，OpenAthor 不移动、不重命名、不标准化原稿。确认写正文、改稿、拆章、合章、资产同步时都使用 source hash 做冲突保护。

### 4. 结构编辑可回滚、可解释

插章和移章只改变 display order，不改变稳定章节 ID。归档不物理删除正文文件。重规划只能替换 planned future outline，不直接改写已写正文。

### 5. 风格控制不等于仿写

`style analyze` 只生成抽象风格画像，默认 pending。只有用户确认后的 active style profile 才会进入 `context`、`draft`、`review` 和 `revise` proposal。

## 当前可交付范围

已落地的主要命令包括：

```bash
openathor init
openathor adopt
openathor doctor
openathor index rebuild
openathor skill install pi
openathor context
openathor draft
openathor review
openathor revise
openathor canon sync
openathor outline show/impact/insert/move/split/merge/replan/archive
openathor search text/related/semantic
openathor assets audit/sync/link-backfill
openathor style analyze/profile show/profile apply/check/revise
openathor export --format markdown
openathor-fixture-check
openathor-judge-smoke
```

详细命令合约见 [CLI Contract](docs/cli-contract.md)。

## 验证情况

当前回归覆盖：

- Slice 1：协议内核、新建项目、接管 3 章、散稿识别、歧义章节顺序
- Slice 2：写作上下文、draft/review/revise proposal、确认写章、hash 冲突、canon 冲突
- Slice 3：插章、移章、拆章、合章、重规划、归档
- Slice 4：30 章长篇接管、检索、导出、风格画像、资产同步、资产漂移、summary drift、索引重建
- LLM-as-judge smoke：生成可交给 judge 的 evidence package，不在 CI 中调用真实模型

本地完整验证：

```bash
npm test
```

GitHub Actions 会在 PR 和 main 上运行文档健康检查、类型检查、schema 校验和构建。

Release workflow 会在推送 `v*` tag 时自动构建 `openathor.tar.gz` 和 SHA256 校验文件，并发布到 GitHub Releases。发布包内包含 `dist/`、`schemas/` 和生产依赖，因此用户安装时不需要重新构建 TypeScript。

## 仓库结构

```text
src/        TypeScript CLI 和协议实现
schemas/    OpenAthor 项目协议 schema
fixtures/   可重复执行的产品回归样例
docs/       产品形态、项目协议、CLI 合约和决策记录
.codex/     项目本地 Codex skills
```

## 重要边界

- OpenAthor 不做自研 TUI。
- OpenAthor 不做网页编辑器。
- OpenAthor CLI 不直接生成最终正文，正文由 Pi Agent、Operator Agent 或用户在 CLI 外部生成。
- OpenAthor CLI 负责上下文、proposal、diff、安全写入、索引、审计和回归验证。
- 真实 Pi Agent transcript 和 LLM judge scores 作为本地/手动评估证据，不进入必跑 CI。

## 更多文档

- [文档总入口](docs/index.md)
- [Pi Agent 优先产品形态](docs/product-shape-pi-agent.md)
- [项目协议](docs/project-protocol.md)
- [CLI 合约](docs/cli-contract.md)
- [产品和架构决策](docs/decisions.md)
- [LLM-as-Judge Evaluation](docs/llm-as-judge.md)

## 贡献说明

贡献前请先阅读 [AGENTS.md](AGENTS.md)。当前项目坚持 Pi Agent first、明文事实源、CLI 确定性操作和用户确认优先的产品边界。
