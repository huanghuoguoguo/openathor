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
openathor search text
openathor search related
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
- style profile 读取和应用
- run 记录

当前已落地：

- `openathor context`
- `openathor plan`
- `openathor draft`
- `openathor review`
- `openathor revise`
- `openathor canon sync`

当前限制：

- `plan/draft/review/revise/canon sync` 是 proposal 模式。
- `draft chapter next --confirm-write` 支持写入用户确认后的新章文本。
- `revise chapter --confirm-write --base-hash` 支持 hash 匹配时确认改写已有章节。
- CLI 不调用模型，不覆盖已有正文，不直接修改 confirmed canon。
- 语义检索和自动模型评估仍待后续切片补齐。

### Slice 3: Structural Editing

证明长篇结构变更不会破坏引用：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline move`
- `openathor outline archive`
- 后续补齐 `split`、`merge`、`replan`

当前已落地：

- `openathor outline show`
- `openathor outline impact`
- `openathor outline insert`
- `openathor outline archive`

当前限制：

- `outline impact` 使用确定性文本引用扫描和词项重叠，不做语义向量分析。
- `outline insert` 只插入 planned 章节元数据，不创建正文文件。
- `outline archive` 默认只返回 proposal；只有 `--confirm` 才修改结构化元数据。
- 归档不物理删除、移动或重命名正文文件。
- `outline move/split/merge/replan` 仍待实现。

### Slice 4: Retrieval And Export

证明长篇上下文检索和交付路径成立：

- `openathor search text`
- `openathor search related`
- 可选向量检索接口
- `openathor export --format markdown`

当前已落地：

- `openathor search text`
- `openathor search related`

当前限制：

- 只做确定性文本检索。
- `search related` 使用词项重叠，不是向量语义检索。
- 向量检索和 export 仍待实现。

## 命令不变量

- 读命令不能写用户文件
- 写命令必须报告 `writes`
- 高风险写命令必须能生成 diff 或 dry-run 结果
- 写正文、canon、大纲前必须检查相关 source hash
- 所有命令必须能在项目根目录内解释自己的 source files
- 未实现的目标命令应返回结构化 `not_implemented`，不能静默走临时路径
