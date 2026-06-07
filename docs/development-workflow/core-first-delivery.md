# Core-First Delivery

## 目标

这份文档说明 OpenAthor 当前阶段应如何开展工作，重点不是快速堆出 demo，而是持续核对文档已经承诺的核心能力，并用可追溯的资产、验证和 guardrail 把长程工作稳定推进下去。

当前原则是：

- 先核对承诺，再做实现
- 先补核心闭环，再补展示型能力
- 先过 deterministic 验证，再看 agent/judge 体验
- 先防协议漂移，再追求局部“能跑”

## 为什么这样做

OpenAthor 现在已经不是只有前期规划的仓库。`product-shape`、`project-protocol`、`cli-contract`、`decisions`、`target-validation` 和 `llm-as-judge` 已经共同定义了一组产品承诺。

真正的风险不是“功能点没写出来”，而是：

- 写出了一条能跑通的 demo 路径，但没有覆盖文档承诺的核心闭环
- 命令存在，但没有 fixture、evidence 或回归保护
- 局部实现偏离 project protocol、CLI envelope 或 write safety 规则
- 长篇资产沉淀看起来在做，实际上无法稳定接力、检索和审计

所以当前工作方法必须是 doc-driven、core-first、evidence-backed。

## Leader 工作法

### 1. 先冻结本轮要兑现的承诺面

每一轮工作都先从文档里挑出本轮要兑现的承诺，而不是从代码里找“还能再补什么”。

优先读取：

- `docs/product-shape-pi-agent.md`
- `docs/project-protocol.md`
- `docs/cli-contract.md`
- `docs/decisions.md`
- `docs/pre-development/target-validation.md`
- `docs/llm-as-judge.md`

本轮只处理能明确映射到这些文档的能力。

### 2. 建立承诺矩阵

以“文档承诺”而不是“代码模块”作为主轴维护矩阵。推荐字段：

- 承诺项
- 来源文档
- 所属 slice
- 是否核心
- 对应命令或协议资产
- 对应 fixture 或 scenario
- 对应 evidence 或 smoke
- 当前状态：未开始、部分完成、闭环完成
- 当前缺口

其中“是否核心”要严判。满足以下任一条件，应归为核心：

- 影响小说项目协议和事实源安全
- 影响 Pi Agent 的稳定上下文使用
- 影响 confirmed canon、章节结构或用户正文
- 影响长篇资产沉淀、检索、审计和回写
- 影响 deterministic regression 或 CI 门禁

只影响展示效果、命令外观或边缘便捷性的能力，不应先于核心项。

### 3. 做资产盘点，而不是只看功能点

OpenAthor 要比对的是资产，不只是命令数量。每轮至少盘点六类资产：

- 协议资产：`openathor.yaml`、事实源文件、stable ID、hash gate、derived data 边界
- CLI 资产：命令面、JSON envelope、错误码、writes、warnings、diff/dry-run
- 写入安全资产：base hash、confirm、冲突拦截、非侵入式 adopt
- 长篇资产：characters、timeline、hooks、outline links、style profiles、summary drift
- 回归资产：fixtures、deterministic checks、doctor strict、npm test
- 证据资产：judge smoke、evidence package、operator transcript、judge scores attachment

如果某项能力只有“命令能跑”，但没有进入这些资产层，它就还没有真正完成。

### 4. 比对“承诺资产”与“现有资产”

推荐按下面的方式比对：

| 对比项 | 要问的问题 |
| --- | --- |
| 承诺是否存在 | 这项能力是否被 route page 或 child doc 明确承诺过 |
| 核心性是否明确 | 这项能力是核心闭环还是外围增强 |
| 协议是否落地 | 是否映射到明确事实源、派生数据和 write boundary |
| 命令是否落地 | 是否已有稳定命令、输出和错误语义 |
| 回归是否落地 | 是否已有 fixture、strict check 或 smoke |
| 证据是否可交付 | 是否能形成让 QA/Judge 复核的 evidence package |
| 漂移是否受控 | 是否会绕过 stable ID、hash gate、confirmed/pending 边界 |

比对结果只分三类：

- 已闭环：命令、协议、回归、证据齐全
- 半闭环：命令存在，但验证或证据不足
- 假完成：能跑 demo，但不满足协议、安全或回归要求

### 5. 按“闭环价值”排优先级

优先级不按 demo 观感排，而按下面顺序排：

1. 会影响事实源和用户信任边界的能力
2. 会影响 Pi Agent 正确理解上下文的能力
3. 会影响长篇结构、资产承接和 drift audit 的能力
4. 会影响回归稳定性和 CI 门禁的能力
5. 最后才是展示性增强、额外导出和扩展接口

这也是为什么当前应强调 core completion 大于 demo completion。

## Sub-agent 协作方式

sub-agent 可以用，但角色应是审计和收敛，不是替代主决策。

推荐角色：

- Contract Auditor：从产品形态、协议、CLI 和决策文档提取本轮承诺项
- Asset Auditor：盘点命令、fixture、schema、smoke、evidence 是否齐全
- Scenario Runner：按 fixture 或场景集复核“命令是否真能支撑用户任务”
- Drift Reviewer：检查实现是否绕过 protocol、stable ID、hash gate 或 confirmed/pending 边界
- QA Synthesizer：整理 blocking failures、回归风险和仍未闭环项

Leader 负责：

- 定义本轮承诺面
- 决定什么算核心
- 合并 sub-agent 发现
- 决定是否进入实现或回到文档层
- 对“完成”给出统一口径

sub-agent 的结论只能作为证据输入，不能直接替代产品判断。

## 我们怎么做 Vibe Coding

这里的 “vibe coding” 不是无约束地边写边试，而是有边界的高频迭代。

原则是：

- 用 route page 和 child docs 约束方向，不靠临场想法扩面
- 用 implementation slices 控制节奏，不把临时路径做成长期架构
- 用 fixtures、strict checks 和 smoke 限制“看起来能跑”的错觉
- 用 sub-agent 做并行盘点、审计和 QA，而不是让所有判断都串行堆在主线程
- 用 evidence package 保留每次闭环的可复核证据

没有依赖 OpenSpec 或 Superpower 这类外部流程框架。当前长程推进主要依赖的是：

- 顶层 route docs 形成的产品和架构合同
- slice 文档形成的阶段性交付边界
- fixtures 和 deterministic checks 形成的最小真实门禁
- LLM-as-judge evidence 形成的人工/模型复核证据
- issue -> branch -> PR -> CI 的 GitHub 协作主线

## 验证方法

验证顺序固定为三层。

### 第一层：Deterministic

先验证：

- 项目协议是否成立
- 命令输出是否符合 envelope
- writes、warnings、errors 是否结构化
- hash gate、confirm、diff/dry-run 是否生效
- fixture 回归是否稳定

只要 deterministic 层没过，就不能把功能记为完成。

### 第二层：Scenario Regression

再验证：

- 新建项目
- 接管已有小说
- 长篇续写
- 局部改稿
- canon 冲突
- 结构变更
- 资产沉淀和漂移审计
- 长篇检索和上下文引用

这里看的是功能是否真的覆盖用户任务，而不是只覆盖一个 happy path。

### 第三层：Evidence And Judge

最后验证：

- 是否有完整 evidence package
- 是否能复盘命令、输出、writes、diff 和 agent final response
- 是否能让 QA/Judge 判断 safety、canon consistency、change control 和 context use

Judge 分数不能替代 deterministic checks，但可以暴露“命令虽对，使用体验仍错”的问题。

## 防跑偏机制

每次开始实现前，至少回答以下问题：

- 这项工作对应哪个用户场景
- 这项工作对应哪个 project protocol 文档位置
- 这项工作对应哪个 CLI contract 文档位置
- 会读哪些事实源
- 会写哪些事实源或派生文件
- 是否需要 diff、dry-run、confirm、base hash
- 有哪个 fixture、scenario 或 smoke 能验证
- 是否会影响已有 decisions 或 guardrails

如果回答不清楚，先补文档，不直接写代码。

每次完成后，再反查：

- 这次交付补的是核心闭环，还是只补了 demo 表面
- 有没有新增无法回归的行为
- 有没有新增只服务单个命令的一次性结构
- 有没有把本应由 CLI 保证的安全边界偷偷放进 skill 或人工流程

## 经验总结

- 文档不是说明书，而是当前阶段的合同面。先核对合同，再谈开发速度。
- 能跑命令不等于能力完成。没有 fixture、smoke 和 evidence 的功能，最多算半成品。
- 长篇写作工具最怕的不是“不智能”，而是破坏正文、漂移 canon、丢失结构和资产引用。
- sub-agent 最有价值的地方是并行审计和证据收敛，不是替 Leader 做产品决策。
- 长程工作能持续推进，靠的不是更重的流程名词，而是承诺矩阵、资产盘点、回归门禁和统一完成口径。

## 推荐执行节奏

每轮迭代建议固定成：

1. 从文档提取本轮承诺项
2. 盘点现有资产并标出核心缺口
3. 用 sub-agent 并行做 contract、asset、scenario、drift 审计
4. 只实现一个或一组可闭环的核心缺口
5. 跑 deterministic checks 和 smoke
6. 记录 evidence、文档状态和剩余 gap
7. 再决定下一轮，而不是顺手扩面

这套节奏的目标不是“慢”，而是让 OpenAthor 每一轮都更接近目标产品，而不是更接近一个会漂移的 demo。
