# Command Index

## 目标命令面

OpenAthor 的目标命令面按能力分组。

### Project

```bash
openathor init
openathor adopt --dry-run
openathor adopt
openathor doctor
openathor index rebuild
openathor skill install pi
```

### Context And Search

```bash
openathor context
openathor assets audit
openathor assets sync
openathor assets link-backfill
openathor search text
openathor search related
openathor search semantic
```

### Style

```bash
openathor style analyze
openathor style profile show
openathor style profile apply
openathor style check
openathor style revise
```

### Outline

```bash
openathor outline show
openathor outline insert
openathor outline move
openathor outline archive
openathor outline split
openathor outline merge
openathor outline replan
openathor outline impact
```

### Writing

```bash
openathor plan
openathor draft
openathor review
openathor revise
openathor canon sync
openathor export --format markdown
```

## 实现切片

目标命令面一次定义清楚，代码实现按完整闭环切片推进。

### Slice 1: Protocol Kernel

证明项目协议和接管路径成立：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor index rebuild`
- JSON envelope
- 错误码和写入安全基础

### Slice 2: Agent Writing Loop

证明 Pi Agent 可以基于协议完成写作闭环：

- `openathor context`
- `openathor plan`
- `openathor draft`
- `openathor review`
- `openathor revise`
- `openathor canon sync`
- style profile 分析、读取和应用
- run 记录

当前已落地：

- `openathor context`
- `openathor style analyze`
- `openathor style profile show`
- `openathor style profile apply`
- `openathor style check`
- `openathor style revise`
- `openathor plan`
- `openathor draft`
- `openathor review`
- `openathor revise`
- `openathor canon sync`

当前限制：

- `plan/draft/review/revise/canon sync` 是 proposal 模式，并支持 `--diff` 预览 proposal/pending 文本且不落盘。
- `draft/review/revise` proposal 会在 `context_pack.style_guidance` 和顶层 `style_guidance` 暴露 confirmed active style profile、do/avoid 规则、pending profile 排除状态和参考文本不进入上下文的安全标记。
- `draft chapter next --confirm-write` 支持写入用户确认后的下一章文本；若 outline 中已有可写 planned 章，则填充该 planned 章，否则追加新章。
- `revise chapter --confirm-write --base-hash` 支持 hash 匹配时确认改写已有章节。
- `context` 暴露 `bible/world.md`、`bible/characters.md`、`bible/timeline.md`、`style/profiles.yaml` 和可执行 `style_guidance`，作为长篇资产沉淀和风格约束入口。
- proposal 写入前会对 confirmed canon 中的硬约束做确定性冲突拦截，命中时返回 `OA_CANON_CONFLICT` 且不写文件。
- `review chapter <target> --multi-agent` 已支持生成确定性多角色审稿包，包含 role pack、findings schema、merge policy 和 sub-agent 写入边界；CLI 不调用模型、不调度真实 sub-agent。
- `style check` 当前是确定性指标和词项扫描，不是 LLM 文风判断；规则扫描只使用 `bible/style.md` 和 confirmed active profile，不把 pending profile 当作写作指导。
- `style analyze` 当前生成 pending style profile，不生成 confirmed profile，不复制参考文本原文。
- `style profile apply` 已支持 hash 保护的 confirmed profile 激活；`style revise` 已支持 proposal、diff 和 `--confirm-write --base-hash` 安全写入，但修订正文仍由 Pi/Operator Agent 或用户在 CLI 外部生成，CLI 不调用模型。
- CLI 不调用模型，不覆盖已有正文，不直接修改 confirmed canon。
- 真实 LLM judge scores attachment 已支持；更完整的真实 Pi Agent 场景集仍待扩展。

### Slice 3: Structural Editing

证明长篇结构变更不会破坏引用：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline move`
- `openathor outline split`
- `openathor outline merge`
- `openathor outline replan`
- `openathor outline archive`
- 后续继续扩展更复杂的 confirmed replan 场景

当前已落地：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline move`
- `openathor outline split`
- `openathor outline merge`
- `openathor outline replan`
- `openathor outline archive`

当前限制：

- `outline impact` 使用确定性文本引用扫描和词项重叠，不做语义向量分析。
- `outline insert` 只插入 planned 章节元数据，不创建正文文件。
- `outline move` 只修改 display order，不移动或重命名正文文件。
- `outline split` 默认只生成拆章 proposal；`--confirm --base-hash` 支持确认拆章写入。
- `outline merge` 默认只生成合章 proposal；`--confirm --base-hash --next-base-hash` 支持确认合章写入，合并到目标正文并归档下一章，不删除原正文文件。
- `outline replan` 默认只生成重规划 proposal；`--from-package --confirm --base-hash` 支持替换 planned future outline 章节，不修改正文文件或 confirmed canon。
- `outline archive` 默认只返回 proposal；只有 `--confirm` 才修改结构化元数据。
- 归档不物理删除、移动或重命名正文文件。
- confirmed replan 仅覆盖 planned future 章节；若边界内包含 drafted/revised 章节，需要先使用 archive/split/merge/revise 等受控流程处理。

### Slice 4: Retrieval And Export

证明长篇上下文检索和交付路径成立：

- `openathor search text`
- `openathor search related`
- `openathor search semantic`
- `openathor assets audit`
- 可选向量检索接口
- `openathor export --format markdown`

当前已落地：

- `openathor search text`
- `openathor search related`
- `openathor search semantic`
- `openathor assets audit`
- `openathor assets sync`
- `openathor assets link-backfill`
- `openathor export --format markdown`

当前限制：

- 只做确定性文本检索。
- `search related` 使用词项重叠，不是向量语义检索。
- `search semantic` 使用可重建的本地 deterministic hash embedding 向量索引，不调用外部 embedding 服务。
- `assets audit` 使用 Markdown/YAML 文本扫描检查 story assets、outline links 和章节正文提及，不做完整语义事实推理。
- `assets sync` 接收 agent/用户提供的结构化资产包，默认 pending；确认写入必须提供目标章节 hash 和 proposal 输出的资产源 hashes，会写入新资产、合并更新既有 confirmed 人物/时间线/伏笔资产，并更新目标章节 outline links。既有人物的最新 `current_state` 写回档案，早期状态作为 `note: previous_state` 保留；若用户在确认前手改人物、时间线、伏笔或 outline，旧资产包必须因 hash gate 失败而不能覆盖。
- `assets link-backfill` 只把已确认人物名称在章节文本中的直接出现回填为 outline `links.characters`，确认写入必须提供最新 `outline/chapters.yaml` hash；它不新增资产、不写 canon、不改正文。
- 多章资产沉淀回归覆盖连续章节写入后的 `assets sync --confirm`、confirmed story assets、outline links、检索/context 和 `assets audit` 无漂移结果，并验证既有人物性格、事迹和当前状态持续承接。
- export 当前只支持完整 manuscript Markdown 合并导出；EPUB/DOCX/PDF 仍不在当前切片内。

## 命令不变量

- 读命令不能写用户文件
- 写命令必须报告 `writes`
- 高风险写命令必须能生成 diff 或 dry-run 结果
- 写正文、canon、大纲前必须检查相关 source hash
- 所有命令必须能在项目根目录内解释自己的 source files
- 未实现的目标命令应返回结构化 `not_implemented`，不能静默走临时路径
