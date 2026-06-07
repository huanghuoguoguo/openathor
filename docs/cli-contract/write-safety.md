# Write Safety

OpenAthor 的写入安全优先级高于写作速度和自动化程度。用户正文、confirmed canon 和结构化大纲都不能被静默破坏。

## 写入等级

### Read-only

只读取文件，不写任何内容。

示例：

- `doctor`
- `context`
- `search text`
- `outline show`
- `outline impact`

### Derived-only

只写可重建派生数据。

示例：

- `index rebuild`

### Proposal

生成 diff、建议、review 或 pending 内容，需要用户确认后才进入 confirmed。

示例：

- `draft --diff`
- `revise --diff`
- `canon sync --diff`
- `outline replan --diff`

`plan`、`draft`、`review`、`revise` 和 `canon sync` 的 `--diff` 只预览将写入的 proposal/pending 文本，返回 `planned_writes` 和 `diff.proposal_text`，不得落盘。`--diff` 不能与 confirmed write 选项同时使用。

### Confirmed write

实际写入用户可见事实源文件。必须记录 run，并报告 `writes`。

示例：

- `init`
- `adopt`
- 用户确认后的 `canon sync`
- 用户确认后的 outline 结构变更

`canon sync --confirm` 必须使用最新 `bible/canon.md` hash，并由 Pi/Operator Agent 或用户提供已确认的 `--text`；CLI 不从 `--task` 自动推断 confirmed canon。

## 高风险操作

以下操作必须有 dry-run、diff 或影响分析：

- 接管已有小说
- 修改正文
- 修改 confirmed canon
- 插入、移动、归档、拆分、合并章节
- 重规划后续剧情
- 标准化或移动用户原稿

## Hash 检查

CLI 在写入基于旧上下文的修改前，应检查 source hash。

如果文件已被用户手动修改，应停止写入，返回结构化冲突。Pi Agent 需要向用户解释冲突，而不是重试覆盖。

## 用户确认

Pi Agent 可以建议修改，但以下内容默认需要用户确认：

- pending canon 进入 confirmed canon
- 删除或归档章节中的重要事实迁移
- 改变既有大纲后续方向
- 标准化已有稿件目录
- 重写超过局部目标范围的正文

## Run 记录

写操作应记录：

- 用户原始任务
- agent role
- CLI 命令
- sources 和 hashes
- writes
- diff 摘要
- 用户确认状态
- warnings 和 conflicts

## 禁止行为

- 不静默覆盖用户正文
- 不静默删除、移动或重命名原稿
- 不把模型推断直接写入 confirmed canon
- 不让 agent 直接写 `.openathor/index.sqlite`
- 不在未记录 run 的情况下执行高风险写入
