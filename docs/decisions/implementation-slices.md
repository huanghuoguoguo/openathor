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

当前状态：`openathor context` 已作为只读上下文包命令落地，并暴露人物、世界观、时间线和 style profile 资产；`openathor style analyze` 已支持从授权参考文本生成 pending style profile 和 reference 记录；`openathor style profile show` 已作为只读 profile 检查命令落地；`openathor style profile apply --confirm --base-hash` 已支持把已审阅 profile 激活为 confirmed project style；`openathor style check` 已作为确定性文风指标检查落地；`openathor style revise` 已支持 proposal、diff 和 `--confirm-write --base-hash` 安全写入，但修订正文仍由 Pi/Operator Agent 或用户在 CLI 外部生成；`plan`、`draft`、`review`、`revise`、`canon sync` 已作为 proposal 入口落地，支持 `--diff` 预览 proposal/pending 文本且不落盘；proposal 写入前会对 confirmed canon 硬约束做确定性冲突拦截，命中 `OA_CANON_CONFLICT` 时不写 run/proposal；确认后的 `draft chapter next` 可填充下一个 planned outline 章或追加新章，标题 fallback 和 `revise chapter --base-hash` 安全改写已落地，并纳入 fixture 回归。CLI 仍不调用模型。

## Slice 3: Structural Editing

目标：证明长篇章节结构变更不会破坏引用和上下文。

包含：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline move`
- `openathor outline split`
- `openathor outline merge`
- `openathor outline replan`
- `openathor outline archive`
- 后续扩展更复杂的 confirmed replan 场景

验收重点：

- 插章不改变已有章节 ID
- 拆章确认写入必须检查 base hash
- 合章和重规划在没有 confirmed write 前只能 proposal
- 归档不物理删除正文
- 影响分析覆盖 canon、伏笔、人物状态和后续章节
- 结构变更后 context 可刷新

当前状态：`openathor outline show`、`openathor outline impact`、`openathor outline insert`、`openathor outline move`、`openathor outline split`、`openathor outline merge`、`openathor outline replan` 和 `openathor outline archive` 已作为结构编辑最小闭环落地，并纳入 fixture 回归。`split --confirm --base-hash` 支持确认拆章写入；`merge --confirm --base-hash --next-base-hash` 支持确认合章写入，会合并到目标正文并归档下一章，不删除原正文文件；`replan --from-package --confirm --base-hash` 支持用结构化 package 替换 planned future outline 章节，不修改正文文件，不替换 drafted/revised 章节；后续 `draft chapter next --confirm-write` 会填充重规划后的下一个 planned 章节，而不是追加重复章节。

## Slice 4: Long Project Retrieval

目标：证明几十章以上小说能获得相关上下文，不靠 agent 全文硬读。

包含：

- `openathor search text`
- `openathor search related`
- `openathor search semantic`
- SQLite 结构化查询
- 可选向量检索接口
- context pack 压缩策略

验收重点：

- 文本搜索先可用
- 语义检索可插拔
- 向量索引仍是派生数据
- context 包含来源证据

当前状态：`openathor search text`、`openathor search related`、`openathor search semantic`、`openathor assets audit`、`openathor assets sync`、`openathor assets link-backfill` 和 `openathor export --format markdown` 已落地，并纳入 fixture 回归。30 章接管 fixture 验证较长连载稿可被非侵入式 adopt、重建 manuscript/vector 索引、通过 text/semantic search 找回前文线索、生成第 30 章 context，并为第 31 章生成 dry-run draft proposal；资产连续性 fixture 验证 `bible/world.md`、`bible/characters.md`、`bible/timeline.md`、canon、notes 和 style profile 能被 context/search/semantic/export 闭环引用；资产漂移 fixture 验证 `assets audit` 能发现 outline link 悬空和正文人物提及未关联；资产同步 fixture 验证写作后结构化资产包默认进入 pending，并在 `--confirm --base-hash` 加 proposal 输出的 `--assets-hash` 后写入人物、时间线、伏笔和章节 outline links，再由 `assets audit` 证明无 link drift；资产同步负例回归验证资产源 hash 改变时返回 `OA_ASSETS_SOURCE_CHANGED` 且不写文件，避免旧 asset package 覆盖用户手改的人物状态或 outline；资产 link backfill fixture 验证接管既有长篇后，可把已确认人物在旧章节正文中的直接出现回填为 outline character links，并用 outline hash gate 防止并发覆盖；多章资产沉淀 fixture 还回归 `assets sync --confirm` 对既有人物 `current_state` 的 confirmed 写回、旧状态 `previous_state` 保留，以及人物 `role`、`traits`、`note` 等档案字段解析，用 `character_profile_coverage` 和全项目 `character_profile_summary` 检查人物性格、事迹和当前状态是否被持续承接；Pi 资产沉淀 fixture 验证 `assets audit` 能识别 Operator 常写的 `- id:` + `name:` 资产块，并把 outline links 解析到人物、timeline 和 hook；摘要漂移 fixture 验证 `summary_drift` 能发现大纲摘要和正文弱匹配，以及摘要保留较多正文名词但加入正文未支持的否定/降级断言这两类漂移。人物档案 weak warning 只在项目级词项覆盖偏低且档案字段命中数不足时触发，避免把稳定身份没有逐章重复写作误报为漂移。`index rebuild` 已能从 outline 和正文重建 `.openathor/manuscript.index.yaml`，覆盖 agent 写新章但漏同步索引的真实问题。`search semantic` 使用 `openathor index rebuild --vector` 生成的本地 deterministic hash embedding 派生索引，不调用外部 embedding 服务；export 当前只支持从明文 manuscript source 合并导出 Markdown。

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

当前状态：第一版 smoke 已覆盖 `fixtures/slice-2/draft-confirm-write` 和 `fixtures/slice-3/outline-archive`，并支持把本地真实 Operator Agent transcript、agent final response 和 LLM judge scores 附加到单个 evidence package。真实 Pi Agent transcript attachment 和 LLM judge scores 保持本地/手动评估，不进入必跑 CI。

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
