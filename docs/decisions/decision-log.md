# Decision Log

## 2026-06-04: Pi Agent First

OpenAthor 第一目标环境是 Pi Agent。

不在当前产品轨道中主动适配 Codex、Claude Code、Cursor 或其他 agent。后续适配必须建立在 OpenAthor Project Protocol 和 CLI Contract 已稳定的基础上。

## 2026-06-04: 不自研写作编辑器

OpenAthor 不做自研 TUI 或 Web 编辑器。用户继续使用 VSCode、Obsidian、Typora、Neovim、Zed 等外部编辑器。

产品价值集中在 agent-native 小说项目协议、上下文组织、canon 维护、审稿、改稿和结构变更安全。

## 2026-06-04: Project Protocol 是核心产品资产

项目协议不是实现细节。它定义用户小说项目如何长期存在、被接管、被续写、被审查和被维护。

代码实现必须服务协议，不能为了某个命令方便临时改变目录结构、ID 规则或事实源边界。

## 2026-06-04: 明文文件是唯一事实源

Markdown、YAML 和 JSON 是用户内容的事实源。SQLite、向量索引和缓存都是派生数据。

任何只能从数据库恢复的用户内容都违反产品方向。

## 2026-06-04: Skill 轻逻辑，CLI 做确定性操作

Pi Skill 定义 agent 行为、任务路由和确认规则。OpenAthor CLI 执行确定性项目操作。

复杂业务逻辑不应堆进 skill 文档，也不应让 Pi Agent 自己拼接文件系统规则。

## 2026-06-04: 接管已有小说默认非侵入式

`adopt` 的目标是理解已有项目，而不是强制迁移用户原稿。

接管流程默认扫描、分类、建索引、生成 pending canon 和 import questions，不移动或重写正文。

## 2026-06-04: 先定义完整目标形态，再按切片实现

OpenAthor 不把“临时最小版本”作为产品设计准绳。

目标协议、目标 CLI 命令面、写入安全、评估体系和防偏移规则需要先想清楚。实现可以分期，但每个切片都必须是目标形态的受控子集，不能写成将来要推倒的局部最优方案。

## 2026-06-04: LLM Judge 只判断高阶质量

LLM-as-judge 不替代 schema 校验、diff 校验、索引一致性、文件 hash 和 CLI 错误检查。

确定性问题必须由程序检查；judge 负责用户体验、写作适配、上下文使用和高层行为质量。

## 2026-06-04: Pi Agent + GLM-5 Runtime 可作为首个执行环境

Pi Agent 0.78.0 可以通过自定义 `jdcloud-anthropic` provider 调用 JD Cloud Anthropic-compatible `GLM-5`。

已验证能力：

- `models.json` 可注册 `GLM-5`
- Pi 可完成非交互模型调用
- 显式 `--skill <path>` 可加载 skill
- Pi 可调用本地 bash 工具并读取 JSON
- Pi 可对受控临时文件执行小范围编辑

限制和约束：

- 不能依赖模型只凭 skill 名称自动找到临时 skill；OpenAthor 的安装命令必须把 Pi Skill 放到 Pi 可发现的确定路径。
- Pi+GLM-5 的自然语言输出质量可以作为 Operator Agent 初始实现路径，但不能单独作为质量结论。
- 所有 Pi+GLM-5 生成或执行结果都必须经过 deterministic checks；写作、审稿、改稿和用户体验再交给 LLM-as-judge 评分。
- 对需要高可靠性的场景，可以使用 sub-agent 并行执行，再由主 Operator Agent 汇总。

当前结论：Pi Agent first 产品轨道成立，可以进入 Slice 1 协议内核实现准备。

## 2026-06-04: Slice 1 固定为 Protocol Kernel

正式开工的第一个实现切片固定为 Protocol Kernel。

包含命令：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor index rebuild`

不包含：

- 正文生成
- 模型调用写作
- 结构化改稿
- 语义向量检索
- sub-agent 调度器

原因：先把项目协议、非侵入式接管、JSON envelope、错误码、expected writes 和 deterministic check 打稳，避免后续写作能力建立在临时数据模型上。

## 2026-06-04: Slice 1 fixtures 和 schema 先行

Slice 1 实现前必须先落地 schema 和 fixtures。

优先 schema：

- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- `outline/chapters.yaml`
- `outline/volumes.yaml`
- `outline/scenes.yaml`

优先 fixtures：

- `new-project`
- `adopt-3-chapters`
- `scattered-drafts`
- `adopt-ambiguous-order`

fixture check 先作为测试侧入口实现，后续再整合进完整测试框架。

## 2026-06-04: CLI 使用 TypeScript

OpenAthor CLI 使用 TypeScript 和 Node.js 实现，不使用 Python。

原因：

- CLI 是长期维护的 agent-facing 工具层，需要更严格的类型约束和可维护模块边界。
- Pi Agent 调用的是命令行二进制，Node.js 打包和跨平台分发路径更适合当前目标。
- JSON、YAML、schema validation、diff 和 fixture runner 都可以在 TypeScript 生态中稳定实现。

约束：

- 协议 schema 放在语言无关的 `schemas/` 目录，不绑定到具体运行时包目录。
- TypeScript 代码不得改变既有 Project Protocol、CLI Contract 和写入安全决策。
- Slice 1 仍先完成 schema、fixtures 和 deterministic check 入口，再实现命令逻辑。

## 2026-06-04: Sub-agent 可用于并行开发和测试，但不能替代主线验收

进入实现后，可以使用 sub-agent 并行推进：

- 协议/schema agent
- CLI contract/test agent
- fixture authoring agent
- deterministic QA agent
- LLM judge agent

主 Operator Agent 对最终代码、文档、测试和合并负责。

sub-agent 输出只能作为 findings、patch suggestions、test reports 或 judge reports。不得让 sub-agent 直接绕过主线检查写入 confirmed canon、用户正文或核心协议决策。

## 2026-06-04: Slice 1 Protocol Kernel 已落地

Slice 1 已实现为 TypeScript/Node.js CLI，并纳入 `npm test`。

已实现命令：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor index rebuild`
- `openathor skill install pi`
- `openathor-fixture-check`

已落地验证：

- Slice 1 schema 编译校验
- `fixtures/slice-1/new-project`
- `fixtures/slice-1/adopt-3-chapters`
- `fixtures/slice-1/scattered-drafts`
- `fixtures/slice-1/adopt-ambiguous-order`
- 项目级 Pi Skill 安装
- fixture runner 校验 JSON envelope、expected files、disallowed writes，并运行 `openathor doctor --json --strict`

当前限制：

- 不包含正文生成、写作改稿闭环、语义检索或 sub-agent 调度。
- LLM-as-judge 仍是评估文档和 rubric，尚未自动化接入测试运行。

## 2026-06-05: Slice 2 Context 命令已落地

`openathor context` 已作为 Slice 2 的只读入口实现。

已实现：

- `openathor context --json`
- `openathor context project --json`
- `openathor context chapter <id-or-display-order> --json`
- `--max-chars <count>`

当前行为：

- 读取 `openathor.yaml`、outline、manuscript index、canon、pending canon、style、notes 和目标章节前后正文。
- 输出 JSON envelope、sources/hash、warnings 和 context pack。
- 不写文件，`writes` 为空。
- 目标章节不存在时返回 `OA_CONTEXT_TARGET_NOT_FOUND`。

当前限制：

- 不调用模型。
- 不生成正文或 diff。
- 不做语义检索，只提供确定性上下文包。

## 2026-06-05: Slice 2 Writing Proposal 入口已落地

写作闭环的第一版实现采用 proposal 模式。

已实现：

- `openathor plan --task <text> --json`
- `openathor draft chapter <target> --task <text> --json`
- `openathor review chapter <target> --task <text> --json`
- `openathor revise chapter <target> --task <text> --json`
- `openathor canon sync [target] --task <text> --json`
- `--dry-run`

当前行为：

- 命令先读取 context。
- 写入 `runs/run_*.json`。
- plan/draft 写入 `notes/` proposal。
- review/revise 写入 `reviews/` proposal。
- canon sync 只追加到 `bible/canon.pending.md`。
- 不修改正文，不修改 `bible/canon.md`。

原因：

- 先让 Pi Agent 有可审计的任务包、上下文来源和 run 记录。
- 避免 CLI 在没有模型质量评估和用户确认机制前直接改正文。

## 2026-06-05: 确认后的下一章草稿写入已落地

`openathor draft chapter next --confirm-write` 已实现为保守 confirmed write。

已实现：

- `openathor draft chapter next --task <text> --text <manuscript> --confirm-write --json`
- `--dry-run`

当前行为：

- 只创建新的下一章文件：`manuscript/chapter-NNN.md`
- 更新 `outline/chapters.yaml`
- 更新 `.openathor/manuscript.index.yaml`
- 写入 `runs/run_*.json`
- 不覆盖接管原稿路径
- 不覆盖已有 manuscript 文件
- 章节标题优先取 `--text` 第一行 Markdown H1；没有 H1 时依次尝试任务中的书名号标题、引号标题、项目标题和 `Chapter N` fallback。

限制：

- 不调用模型，`--text` 必须由 Pi Agent 或用户提供。
- 只支持写入新的下一章，不覆盖已有章节。
- 写入后派生 SQLite 索引会变 stale，需要 `openathor index rebuild --json`。

验证：

- `fixtures/slice-2/draft-confirm-write`
- `fixtures/slice-2/draft-title-fallback`

## 2026-06-05: 已有章节确认改写和 hash 冲突保护已落地

`openathor revise chapter <target> --confirm-write` 已支持确认后改写已有章节。

已实现：

- `openathor revise chapter <target> --task <text> --text <manuscript> --base-hash <sha256:...> --confirm-write --json`
- `--dry-run`

当前行为：

- 必须提供 `--base-hash`。
- 当前正文 hash 与 `--base-hash` 不一致时返回 `OA_MANUSCRIPT_CHANGED`。
- hash 匹配时改写目标章节 `source_path`。
- 更新 `outline/chapters.yaml` 状态为 `revised`。
- 更新 `.openathor/manuscript.index.yaml` 的 `content_hash`。
- 写入 `runs/run_*.json`。

验证：

- `fixtures/slice-2/revise-confirm-write`
- `fixtures/slice-2/revise-hash-conflict`

## 2026-06-05: 确定性文本检索已落地

`openathor search text` 已实现为只读文本检索命令。

已实现：

- `openathor search text <query> --json`
- `--limit <count>`
- `--max-chars <count>`

当前行为：

- 扫描已索引正文、bible、outline、notes、reviews 和项目内其他明文文本文件。
- 返回 path、hash、line、column 和 snippet。
- `writes` 为空。
- 不调用模型，不做语义排序。

验证：

- `fixtures/slice-4/search-text`

## 2026-06-05: 结构编辑最小闭环已落地

`openathor outline show`、`openathor outline impact` 和 `openathor outline archive` 已实现。

已实现：

- `openathor outline show --json`
- `openathor outline impact <target> --json`
- `openathor outline archive <target> --json`
- `openathor outline archive <target> --confirm --base-hash <hash> --json`

当前行为：

- `outline show` 只读返回章节大纲、状态、source path 和 hash。
- `outline impact` 只读扫描直接引用、词项相关上下文、候选事实和后续章节。
- `outline archive` 默认 proposal，不写文件。
- 用户确认后只更新 `outline/chapters.yaml` 和 `.openathor/manuscript.index.yaml` 的章节状态，并写 run record。
- 归档不删除、移动或重命名正文文件。

验证：

- `fixtures/slice-3/outline-archive`

## 2026-06-05: 确定性相关检索已落地

`openathor search related chapter <target>` 已实现。

已实现：

- `openathor search related chapter <target> --json`
- `--limit <count>`
- `--max-chars <count>`

当前行为：

- 从目标章节提取词项。
- 按词项重叠给候选文件打分。
- 返回 path、hash、score、shared_terms 和 snippet。
- `writes` 为空。
- 不调用模型，不做向量语义检索。

验证：

- `fixtures/slice-4/search-text`

## 2026-06-05: LLM-as-judge smoke 已落地

`openathor-judge-smoke` 已实现为自动化 evidence package smoke 入口。

已实现：

- `openathor-judge-smoke`
- `npm run test:judge:smoke`
- `npm run judge:smoke`
- `openathor.judge_evidence.v1`

当前行为：

- 复用 deterministic fixture replay。
- 覆盖 `fixtures/slice-2/draft-confirm-write` 和 `fixtures/slice-3/outline-archive`。
- 收集 CLI commands、writes、warnings、file changes、user task 和 agent final response。
- 默认不调用模型，judge 字段为 `needs_review`，明确缺少真实 Operator Agent transcript 和 LLM judge scores。
- 支持通过 `--scenario <name> --operator-transcript <path> --agent-final-response <path>` 把本地真实 Operator Agent transcript 和最终回复附加到单个 evidence package。
- 已接入 `npm test`。

验证：

- `npm run test:judge:smoke`

后续：

- 将 LLM judge scores 和 blocking failures 保存为本地/手动评估证据。
- 保持真实 Pi Agent transcript attachment 为本地/手动评估流程，不进入必跑 CI。

## 2026-06-05: 真实 Pi Agent 和 LLM Judge 不进入必跑 CI

CI 只运行静态和确定性检查，不接入真实 Pi Agent、LLM judge、外部模型服务或外部 API key。

保留在 CI 中的评估入口：

- schema 校验
- TypeScript 类型检查和构建
- deterministic fixture replay
- `openathor-judge-smoke` evidence package 结构校验

真实 Pi Agent transcript、LLM judge scores 和 blocking failure 分析仍使用同一 evidence package 格式，但只作为本地或手动评估证据保存。

原因：

- 外部 key 和模型服务会让 CI 受成本、速率、网络和供应商状态影响。
- 模型输出非确定性，容易造成 PR gate 偶发失败。
- fork PR 和外部贡献场景不应暴露 secrets。
- 必跑 CI 的职责是阻止确定性协议、文件安全和工具链回归。

## 2026-06-05: 章节插入 planned 元数据闭环已落地

`openathor outline insert` 已实现为保守结构编辑命令。

已实现：

- `openathor outline insert --after <target> --title <title> --json`
- `openathor outline insert --after <target> --title <title> --confirm --json`
- `--dry-run`
- `--diff`

当前行为：

- 默认 proposal，不写文件。
- 用户确认后在 `outline/chapters.yaml` 中新增 `planned` 章节。
- 用户确认后顺延后续章节在 `outline/chapters.yaml` 和 `.openathor/manuscript.index.yaml` 中的 `display_order`。
- 不创建正文文件。
- 不移动、重命名或删除已有正文文件。
- 不修改 confirmed canon。
- 写入 `runs/run_*_outline_insert.json`。

验证：

- `fixtures/slice-3/outline-insert`

## 2026-06-05: 章节展示顺序移动闭环已落地

`openathor outline move` 已实现为保守结构编辑命令。

已实现：

- `openathor outline move <target> --after <target> --json`
- `openathor outline move <target> --after <target> --confirm --json`
- `--dry-run`
- `--diff`

当前行为：

- 默认 proposal，不写文件。
- 用户确认后更新 `outline/chapters.yaml` 中受影响章节的 `display_order`。
- 用户确认后更新 `.openathor/manuscript.index.yaml` 中受影响已有正文的 `display_order`。
- 不移动、重命名或删除已有正文文件。
- 不修改 confirmed canon。
- 写入 `runs/run_*_outline_move.json`。

验证：

- `fixtures/slice-3/outline-move`

## 2026-06-05: 拆章 proposal 已落地

`openathor outline split` 已实现为 proposal-only 结构编辑命令。

已实现：

- `openathor outline split <target> --at-line <line> --title-before <title> --title-after <title> --json`
- `--dry-run`
- `--diff`
- `--max-chars <count>`

当前行为：

- 解析目标章节并读取正文 source hash。
- `--at-line` 表示第二段正文的第一行。
- 返回拆分前后两段的标题、行号范围、字符数、预览和 heading 信号。
- `writes` 始终为空。
- 不修改正文文件。
- 不修改 `outline/chapters.yaml`。
- 不修改 `.openathor/manuscript.index.yaml`。
- 不创建新正文文件。
- `planned_writes` 只描述未来 confirmed split 可能触碰的文件。

原因：

- 真实拆章会同时影响正文切分、章节 ID、display order、索引和后续引用，是高风险结构写入。
- 第一版先把拆分边界和风险解释做成可回归的确定性 proposal，再实现 confirmed write。

验证：

- `fixtures/slice-3/outline-split`
