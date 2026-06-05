# Slice 2 Writing Loop

## 目标

Slice 2 写作闭环让 Pi Agent 在 OpenAthor 项目中执行规划、续写准备、审稿、改稿建议和 canon 同步建议。

首个实现只提供可审计 proposal 入口：CLI 负责读取上下文、生成结构化任务文件或 review 文件、记录 run，并保证写入安全。正文生成和复杂文学判断仍由 Pi Agent/模型完成，CLI 不伪装成模型。

## 共同规则

所有命令支持：

```bash
--json
--dry-run
```

默认不修改用户正文，不修改 confirmed canon。

确认写入目前只支持：

```bash
openathor draft chapter next --task <text> --text <manuscript> --confirm-write [--json] [--dry-run]
openathor revise chapter <target> --task <text> --text <manuscript> --base-hash <sha256:...> --confirm-write [--json] [--dry-run]
```

`draft chapter next` 只创建新的下一章文件，不覆盖已有正文。

`revise chapter` 必须提供当前正文 hash。hash 不匹配时返回 `OA_MANUSCRIPT_CHANGED`，不得写入。

实际写入只允许写：

- `runs/run_*.json`
- `reviews/*.md`
- `notes/*.md`
- `bible/canon.pending.md`

所有命令必须：

- 先生成或读取 `openathor context`
- 返回 `sources` 和 hash
- 报告 `writes`
- 将用户任务写入 run 记录
- 对 confirmed canon 和正文修改保持 proposal 状态

## `openathor plan`

### 用途

为目标章节或项目任务生成计划记录，供 Pi Agent 后续写作使用。

### 参数

```bash
openathor plan [target] --task <text> [--json] [--dry-run]
```

### Expected writes

- `runs/run_*.json`
- `notes/plan-*.md`

## `openathor draft`

### 用途

生成续写任务包，而不是直接生成正文。Pi Agent 应使用该任务包和 context 在对话中生成草稿或在用户确认后写入文件。

### 参数

```bash
openathor draft chapter <target> --task <text> [--json] [--dry-run]
```

确认写入新章：

```bash
openathor draft chapter next --task <text> --text <manuscript> --confirm-write --json
```

### Expected writes

- `runs/run_*.json`
- `notes/draft-*.md`

proposal 模式不得写入 `manuscript/` 或接管原稿路径。

确认写入 `chapter next` 时可以写：

- `manuscript/chapter-NNN.md`
- `outline/chapters.yaml`
- `.openathor/manuscript.index.yaml`
- `runs/run_*.json`

确认写入新章标题来源顺序：

1. `--text` 第一行 Markdown H1，例如 `# 第二章`
2. `--task` 中的书名号标题，例如 `《最后一班车》`
3. `--task` 中的引号标题
4. `openathor.yaml` 中的项目标题
5. `Chapter N`

不得覆盖已有 manuscript 文件或接管原稿路径。

## `openathor review`

### 用途

为章节生成审稿任务记录和 review 文件骨架。

### 参数

```bash
openathor review chapter <target> --task <text> [--json] [--dry-run]
```

### Expected writes

- `runs/run_*.json`
- `reviews/review-*.md`

## `openathor revise`

### 用途

生成局部改稿 proposal，不直接改正文。

### 参数

```bash
openathor revise chapter <target> --task <text> [--json] [--dry-run]
```

确认改写已有章节：

```bash
openathor revise chapter <target> --task <text> --text <manuscript> --base-hash <sha256:...> --confirm-write --json
```

### Expected writes

- `runs/run_*.json`
- `reviews/revise-*.md`

proposal 模式只写 review proposal。

确认写入时可以写：

- 目标章节 `source_path`
- `outline/chapters.yaml`
- `.openathor/manuscript.index.yaml`
- `runs/run_*.json`

如果 `--base-hash` 与当前文件 hash 不一致，必须返回 `OA_MANUSCRIPT_CHANGED`。

## Confirmed Canon Conflict Gate

`plan`、`draft`、`review`、`revise` 和 `canon sync` 在写 proposal 前必须先读取 `bible/canon.md`。

如果用户任务明显要求违反 confirmed canon 中的硬约束，命令应返回 `OA_CANON_CONFLICT`，且不得写入 run record、proposal、pending canon 或正文。

当前实现是确定性 hard-rule gate，只扫描 confirmed canon 中包含 `禁忌`、`禁止`、`不能`、`不可`、`绝不可`、`规则` 等措辞的约束行，并匹配明确领域词，例如 `通灵`、`超自然`、`电子密钥`、`客轮`、`机械一窍不通`。它不是完整语义冲突判断，复杂冲突仍需要 Pi Agent 和后续 judge 评估。

## `openathor canon sync`

### 用途

生成 canon 同步 proposal。默认写入 pending，不直接写 confirmed canon。

### 参数

```bash
openathor canon sync [target] --task <text> [--json] [--dry-run]
```

### Expected writes

- `runs/run_*.json`
- `bible/canon.pending.md`

## 当前限制

- CLI 不调用模型，不保证生成最终文学文本。
- `draft chapter next --confirm-write` 只写新的下一章。
- `revise chapter --confirm-write` 只能在 `--base-hash` 匹配时改写目标章节。
- proposal 写入前会拦截确定性 confirmed canon 冲突。
- `canon sync` 不直接写 `bible/canon.md`。
- LLM-as-judge 自动评分仍待接入。
