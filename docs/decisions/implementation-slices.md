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

当前状态：Pi Agent + GLM-5 runtime 已验证可用。Slice 0 剩余工作是把 Slice 1 schema、fixtures 和 deterministic check 入口落地到仓库。

## Slice 1: Protocol Kernel

目标：证明一个 OpenAthor 项目可以被创建、接管、校验和重建索引。

包含：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor index rebuild`
- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- 初始 SQLite 派生索引
- JSON envelope 和错误码
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

- `openathor skill install pi`
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
