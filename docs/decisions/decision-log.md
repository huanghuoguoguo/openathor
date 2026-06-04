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

## 2026-06-04: Sub-agent 可用于并行开发和测试，但不能替代主线验收

进入实现后，可以使用 sub-agent 并行推进：

- 协议/schema agent
- CLI contract/test agent
- fixture authoring agent
- deterministic QA agent
- LLM judge agent

主 Operator Agent 对最终代码、文档、测试和合并负责。

sub-agent 输出只能作为 findings、patch suggestions、test reports 或 judge reports。不得让 sub-agent 直接绕过主线检查写入 confirmed canon、用户正文或核心协议决策。
