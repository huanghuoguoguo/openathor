# Implementation Slices

## 核心原则

OpenAthor 先定义完整目标形态，再按完整闭环切片实现。

切片不是临时架构。每个切片都必须：

- 使用目标 project protocol
- 使用目标 CLI envelope
- 保持写入安全规则
- 记录 run 或明确说明无需记录
- 有对应 scenario 或 fixture
- 不引入未来必须推倒的数据模型

## Slice 0: Product And Contract Freeze

目标：实现前锁住产品方向、协议和 CLI 合约。

完成条件：

- Product shape 已确认
- Project Protocol 已有目标结构
- CLI Contract 已有目标命令面和输出规则
- Decisions 已记录关键防偏移规则
- Validation fixtures 已定义
- Pi Agent runtime spike 有明确结论
- Slice 1 command contracts 已定义
- Slice 1 schema 和 fixture plan 已定义

当前状态：已完成。Pi Agent + GLM-5 runtime 已验证可用，CLI 实现语言锁定为 TypeScript/Node.js，Slice 1 schema、fixtures 和 deterministic check 入口已落地。

## Slice 1: Protocol Kernel

目标：证明一个 OpenAthor 项目可以被创建、接管、校验和重建索引。

包含：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor index rebuild`
- `openathor skill install pi`
- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- 初始 SQLite 派生索引
- JSON envelope 和错误码
- OpenAthor Pi Skill
- Slice 1 fixtures
- deterministic fixture check 入口

验收重点：

- 已有小说可非侵入式接管
- 明文事实源足以重建索引
- ambiguous 文件进入 questions
- 不修改用户原稿
- `doctor --json --strict` 能作为 CI/fixture gate

不包含：

- 正文生成
- 模型调用写作
- 语义向量检索
- sub-agent 调度器

## Slice 2: Agent Writing Loop

目标：证明 Pi Agent 可以基于 OpenAthor 完成规划、续写、审稿、改稿和 canon 同步闭环。

包含：

- `openathor context`
- `openathor plan`
- `openathor draft`
- `openathor review`
- `openathor revise`
- `openathor canon sync`
- `runs/` 记录

验收重点：

- 写作前使用 outline、canon、manuscript 和 notes
- 改稿默认输出 diff
- 新增设定默认进入 pending
- 用户手写冲突能被发现

当前状态：`openathor context` 已作为只读上下文包命令落地；`plan`、`draft`、`review`、`revise`、`canon sync` 已作为 proposal 入口落地；确认后的 `draft chapter next` 新章写入、标题 fallback 和 `revise chapter --base-hash` 安全改写已落地，并纳入 fixture 回归。CLI 仍不调用模型。

## Slice 3: Structural Editing

目标：证明长篇章节结构变更不会破坏引用和上下文。

包含：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline move`
- `openathor outline archive`
- 后续补齐 `split`、`merge`、`replan`

验收重点：

- 插章不改变已有章节 ID
- 归档不物理删除正文
- 影响分析覆盖 canon、伏笔、人物状态和后续章节
- 结构变更后 context 可刷新

当前状态：`openathor outline show`、`openathor outline impact` 和 `openathor outline archive` 已作为结构编辑最小闭环落地，并纳入 fixture 回归。`insert`、`move`、`split`、`merge` 和 `replan` 仍待实现。

## Slice 4: Long Project Retrieval

目标：证明几十章以上小说能获得相关上下文，不靠 agent 全文硬读。

包含：

- `openathor search text`
- `openathor search related`
- SQLite 结构化查询
- 可选向量检索接口
- context pack 压缩策略

验收重点：

- 文本搜索先可用
- 语义检索可插拔
- 向量索引仍是派生数据
- context 包含来源证据

当前状态：`openathor search text` 和 `openathor search related` 已作为只读确定性检索落地，并纳入 fixture 回归。向量语义检索仍待实现。

## Cross-Slice: LLM-as-Judge Smoke

目标：证明已落地场景能形成可交给 judge 的证据包，避免 LLM judge 脱离 deterministic checks。

包含：

- `openathor-judge-smoke`
- `openathor.judge_evidence.v1`
- CLI command evidence
- writes/warnings evidence
- file changes summary
- judge placeholder for real scores

验收重点：

- smoke 不依赖真实模型，能稳定进入 `npm test`
- 证据包包含用户任务、命令、输出、文件变化和 agent 最终回复
- 真实 Pi Agent transcript attachment 和 judge scores 后续能复用同一格式
- deterministic failures 不会被 judge 分数掩盖

当前状态：第一版 smoke 已覆盖 `fixtures/slice-2/draft-confirm-write` 和 `fixtures/slice-3/outline-archive`，并支持把本地真实 Operator Agent transcript 附加到单个 evidence package。真实 Pi Agent transcript attachment 和 LLM judge scores 保持本地/手动评估，不进入必跑 CI。

## Slice 5: Delivery And Expansion

目标：在核心闭环稳定后扩展导出、sub-agent 和其他 agent 适配。

包含：

- `openathor export --format markdown`
- 可选 EPUB/DOCX/PDF 导出
- Pi sub-agent 角色文件
- MCP server
- 其他 agent skill
- 编辑器插件

这些能力不得提前改变核心协议。
