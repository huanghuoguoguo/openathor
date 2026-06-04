# Schema And Fixtures

## 目标

实现前先确定 Slice 1 的协议 schema 和 fixture 目录，避免实现时临时拼格式。

## Schema 决策

Slice 1 使用 YAML 事实源和 JSON Schema 风格的校验定义。

必须先定义并验证：

- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- `outline/chapters.yaml`
- `outline/volumes.yaml`
- `outline/scenes.yaml`

schema 文件建议放在：

```text
schemas/
  openathor.schema.json
  manuscript-index.schema.json
  chapters.schema.json
  volumes.schema.json
  scenes.schema.json
```

YAML 文件通过解析成 JSON-compatible object 后按 schema 校验。

## Fixture 目录

Slice 1 fixtures 建议放在：

```text
fixtures/slice-1/
  new-project/
  adopt-3-chapters/
  scattered-drafts/
  adopt-ambiguous-order/
```

每个 fixture 使用：

```text
fixture-name/
  input/
  expected/
    commands.yaml
    files.yaml
    doctor.json
    disallowed.yaml
```

## Fixture 决策

### `new-project`

验证 `openathor init`。

输入为空目录。

期望：

- 创建标准目录
- 创建 `openathor.yaml`
- 初始化空 `outline/chapters.yaml`
- 不创建正文
- 不创建 SQLite，除非运行 `index rebuild`

### `adopt-3-chapters`

验证清晰章节接管。

输入：

```text
正文/001-雨夜.md
正文/002-旧案.md
正文/003-追问.md
设定/人物.md
```

期望：

- 识别 3 个章节
- 生成 stable chapter ID
- 生成 `.openathor/manuscript.index.yaml`
- 保留原始正文路径
- 提取设定进入 pending 或 notes

### `scattered-drafts`

验证散稿分类。

输入包含正文、设定、灵感、废稿和未知文件。

期望：

- 正文进入 detected chapters
- 设定进入 detected notes 或 pending canon
- 废稿和不确定文件进入 questions
- 不把废稿写入 confirmed canon

### `adopt-ambiguous-order`

验证歧义处理。

输入包含无法稳定排序、重复标题或缺号章节。

期望：

- `adopt --dry-run` 返回 recoverable warning 或 error
- `adopt` 默认不继续
- 使用 `--confirm-ambiguous` 时写入 questions，而不是猜测 confirmed order

## Deterministic Check 入口

实现阶段先提供一个测试侧命令：

```bash
openathor-fixture-check fixtures/slice-1/adopt-3-chapters
```

它应执行：

- fixture input 复制到临时目录
- 按 `expected/commands.yaml` 运行 CLI
- 校验 JSON envelope
- 校验 expected files
- 校验 disallowed writes
- 运行 `openathor doctor --json --strict`

后续可以把它整合到常规 test runner。
