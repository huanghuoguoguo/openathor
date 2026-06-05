# Readiness Checklist

在 Slice 1 开工门禁没有完成前，不进入产品代码实现。

这个 checklist 不是为了把产品压成临时最小版本，而是为了确保实现开始时不会发生产品需求偏移、架构偏移，或为了局部命令写出未来要推倒的数据模型。

## 完成标准

一个准备项只有同时满足以下条件，才算完成：

- 有明确 owning document
- 有当前结论
- 有尚未解决问题的记录
- 有对应验证方式
- 不与已记录的产品和架构决策冲突

## 已锁定的产品和架构决策

- [x] 当前产品轨道是 Pi Agent first
- [x] 不做自研 TUI
- [x] 不做网页编辑器
- [x] 用户继续使用外部文本编辑器
- [x] CLI 是 agent-facing 工具层
- [x] Project Protocol 是核心产品资产
- [x] 明文文件是唯一事实源
- [x] SQLite 和向量索引都是派生数据
- [x] Skill 轻逻辑，CLI 做确定性操作
- [x] 接管已有小说默认非侵入式
- [x] 实现按目标形态切片，不写临时局部架构

参考：

- [Product Shape](../product-shape-pi-agent.md)
- [Project Protocol](../project-protocol.md)
- [CLI Contract](../cli-contract.md)
- [Decisions](../decisions.md)

## 目标用户故事

### Slice 1 开工门禁

- [x] 从零创建新小说项目
- [x] 接管已经写了一半的小说
- [x] 从散稿目录识别正文、设定、灵感和废稿

### 后续切片准备项

- [x] 继续写下一章
- [x] 审查已有章节
- [x] 局部改稿
- [x] 同步新增设定到 canon
- [x] 从中途重规划后续剧情
- [x] 插入章节
- [x] 删除或归档章节
- [x] 移动章节
- [x] 拆分或合并章节
- [ ] 基于授权参考文本生成风格画像
- [ ] 按项目风格画像续写、审稿和改稿

参考：[Core Scenarios](../product-shape-pi-agent/core-scenarios.md)

当前实现状态：

- [x] 写作前只读上下文入口：`openathor context`
- [x] 续写 proposal 入口：`openathor draft`
- [x] 审稿 proposal 入口：`openathor review`
- [x] 改稿 proposal 入口：`openathor revise`
- [x] canon 同步 pending 入口：`openathor canon sync`
- [x] 用户确认后写入下一章新正文：`openathor draft chapter next --confirm-write`
- [x] 确认写入新章标题 fallback：优先 Markdown H1，其次任务中的书名号/引号标题、项目标题、章节序号
- [x] 用户确认后改写已有章节正文：`openathor revise chapter --confirm-write --base-hash`
- [x] 结构编辑最小闭环：`openathor outline show/impact/insert/move/split/archive`
- [x] 用户确认后插入 planned 章节元数据：`openathor outline insert --confirm`
- [x] 用户确认后移动章节展示顺序：`openathor outline move --confirm`
- [x] 拆章 proposal：`openathor outline split`
- [x] 用户确认后拆章写入：`openathor outline split --confirm --base-hash`
- [x] 合章 proposal：`openathor outline merge`
- [x] 重规划 proposal：`openathor outline replan`
- [x] LLM-as-judge 自动化 smoke：`openathor-judge-smoke`

## 项目协议

### Slice 1 开工门禁

- [x] 定义 `openathor.yaml`
- [x] 定义 `bible/`
- [x] 定义 `outline/`
- [x] 定义 volume、chapter、scene 的稳定 ID
- [x] 定义章节 display order 和内部 ID 的关系
- [x] 定义故事资产引用关系
- [x] 定义 `manuscript/`
- [x] 定义 `notes/`
- [x] 定义 `reviews/`
- [x] 定义 `runs/`
- [x] 定义 `.openathor/manuscript.index.yaml`
- [x] 定义 `.openathor/index.sqlite` 的派生索引边界
- [x] 定义 `.openathor/vector/` 的可选检索索引边界
- [x] 定义 confirmed、pending、question 三类 canon 状态
- [x] 定义明文文件是唯一事实源
- [x] 决策 Slice 1 schema 和 fixture 目录
- [x] 落地 Slice 1 schema 文件
- [x] 落地 Slice 1 fixtures

### 后续切片准备项

- [x] 定义 `style/` 和 style profile 协议
- [x] 定义风格参考文本授权状态

参考：[Project Protocol](../project-protocol.md)

## CLI 合约

### Slice 1 开工门禁

- [x] 定义目标命令面
- [x] 定义实现切片顺序
- [x] 定义 JSON 输出格式
- [x] 定义 diff 输出格式
- [x] 定义写入安全等级
- [x] 定义错误码和错误消息原则
- [x] 定义 Slice 1 命令级合约
- [x] 补充 Slice 1 命令参数 schema
- [x] 补充 Slice 1 expected writes
- [x] 补充 Slice 1 fixture contract

### 后续切片准备项

- [ ] 定义 `openathor style analyze`
- [ ] 定义 `openathor style profile show`
- [ ] 定义 `openathor style check`
- [ ] 补充 Slice 2+ 命令级合约

参考：[CLI Contract](../cli-contract.md)

## Pi Skill

### Slice 1 开工门禁

- [x] 定义 Pi Skill 安装位置
- [x] 定义 Pi Skill 文件格式
- [x] 定义 Pi Agent 识别项目的方式
- [x] 定义 Pi Agent 写作前上下文读取顺序
- [x] 定义 Pi Agent 何时必须询问用户
- [x] 定义 Pi Agent 如何处理用户手写内容
- [x] 定义 sub-agent 是可选增强而非基础依赖
- [x] 定义预留 sub-agent 角色
- [x] 定义 run 记录中的 `agent_role`
- [x] 完成 Pi Agent runtime spike：确认模型调用、显式 skill 加载、CLI/JSON 读取和受控编辑流程可行

### 后续切片准备项

- [x] 落地 OpenAthor Pi Skill 文件

当前验证证据：

- `openathor skill install pi --json` 默认写入 `.pi/skills/openathor/SKILL.md`
- `fixtures/slice-1/new-project` 覆盖项目级 skill 安装
- Pi Skill 明确 Slice 1 边界：不伪装成已支持正文生成、审稿、改稿或语义检索

参考：

- [Pi Agent Behavior](../product-shape-pi-agent/pi-agent-behavior.md)
- [Sub-agent Extension](../product-shape-pi-agent/sub-agent-extension.md)
- [Pi Runtime Spike](pi-runtime-spike.md)

## 验收和测试

### Slice 1 开工门禁

- [x] 定义新建项目验收样例
- [x] 定义 3 章已有小说接管样例
- [x] 定义散稿目录样例
- [x] 定义 blocking failure 标准
- [x] 定义 deterministic checks
- [x] 决策 Slice 1 fixture 目录和 expected 输出格式
- [x] 决策自动化 deterministic check 脚本入口
- [x] 落地 Slice 1 fixture 目录和 expected 输出
- [x] 实现自动化 deterministic check 脚本入口

当前验证证据：

- `npm test` 运行 TypeScript 类型检查、schema 校验、构建和 Slice 1 fixture 回归。
- `fixtures/slice-1/new-project`
- `fixtures/slice-1/adopt-3-chapters`
- `fixtures/slice-1/scattered-drafts`
- `fixtures/slice-1/adopt-ambiguous-order`
- `openathor-fixture-check` 会复制 fixture input、执行 expected commands、校验 JSON envelope、expected files、disallowed writes，并在最终项目上运行 `openathor doctor --json --strict`。
- `openathor-judge-smoke` 会复用 fixture replay，为已落地写作/结构场景生成 `openathor.judge_evidence.v1` 证据包。
- `openathor-judge-smoke --scenario <name> --operator-transcript <path> --agent-final-response <path>` 可以把本地真实 Operator Agent 运行记录和最终回复附加到单个 evidence package。

### 后续切片准备项

- [x] 定义 30 章长篇接管样例
- [x] 定义局部改稿样例
- [x] 定义 canon 冲突样例
- [x] 定义结构变更样例
- [x] 定义长篇检索样例
- [x] 定义 LLM judge 输入格式
- [x] 定义 judge rubric

当前实现状态：

- [x] 结构编辑最小闭环：`openathor outline show/impact/insert/move/split/archive`
- [x] 插章 planned 元数据闭环：`openathor outline insert`
- [x] 移章 display order 元数据闭环：`openathor outline move`
- [x] 拆章 proposal：`openathor outline split`
- [x] 确认拆章写入：`openathor outline split --confirm --base-hash`
- [x] 合章 proposal：`openathor outline merge`
- [x] 重规划 proposal：`openathor outline replan`
- [x] 确定性文本检索：`openathor search text`
- [x] 确定性相关检索：`openathor search related`
- [x] 可选派生向量检索：`openathor index rebuild --vector` + `openathor search semantic`
- [ ] confirmed merge 和 confirmed replan
- [x] LLM-as-judge 自动化 smoke：证据包结构校验和 deterministic replay 已接入 `npm test`
- [x] 真实 Pi Agent/Operator Agent transcript 可本地附加到单个 evidence package
- [x] LLM judge scores 可本地附加到单个 evidence package
- [x] CI 保持静态和确定性检查，不接入真实 Pi Agent、LLM judge 或外部 API key
- [x] 真实 Pi Agent transcript 和 LLM judge scores 作为本地/手动评估证据保存

参考：

- [Target Validation](target-validation.md)
- [LLM-as-Judge Evaluation](../llm-as-judge.md)

## 迭代管理

### Slice 1 开工门禁

- [x] 每次产品决策有记录位置
- [x] 每个实现任务能追溯到用户故事、协议、CLI 合约和验证
- [x] 产品和架构防偏移规则已定义
- [x] 实现切片规则已定义
- [x] 每个开放问题有 owner 或下一步
- [x] GitHub issue -> PR -> CI -> squash merge 流程已启用

### 仓库治理

- [ ] `main` 分支保护已启用

参考：[Decisions](../decisions.md)
