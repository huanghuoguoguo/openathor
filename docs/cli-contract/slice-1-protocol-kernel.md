# Slice 1 Protocol Kernel

## 目标

Slice 1 证明 OpenAthor 项目协议可以被创建、接管、校验和重建索引。

这一切片不做正文生成、不调用模型写小说、不做复杂语义检索。它只实现确定性协议内核，给 Pi Agent 和后续 sub-agent 提供稳定项目状态。

## 命令范围

Slice 1 必须实现：

```bash
openathor init
openathor adopt --dry-run
openathor adopt
openathor doctor
openathor index rebuild
```

所有命令必须支持：

```bash
--json
```

写入或拟写入命令必须支持：

```bash
--dry-run
```

## `openathor init`

### 用途

在空目录或指定目录创建标准 OpenAthor 项目骨架。

### 参数

```bash
openathor init [path] [--title <title>] [--language <tag>] [--json] [--dry-run]
```

- `path`：目标目录。省略时使用当前目录。
- `--title`：项目标题。省略时使用目录名或 `未命名小说`。
- `--language`：默认 `zh-CN`。

### Expected writes

实际写入时创建：

- `openathor.yaml`
- `bible/`
- `bible/premise.md`
- `bible/style.md`
- `bible/canon.md`
- `bible/canon.pending.md`
- `outline/`
- `outline/volumes.yaml`
- `outline/chapters.yaml`
- `outline/scenes.yaml`
- `manuscript/`
- `notes/`
- `reviews/`
- `runs/`
- `.openathor/`
- `.openathor/manuscript.index.yaml`

不创建 `.openathor/index.sqlite`，除非用户随后运行 `index rebuild`。

### Errors

- `OA_INIT_TARGET_EXISTS_NONEMPTY`
- `OA_PROJECT_ALREADY_EXISTS`
- `OA_WRITE_PERMISSION_DENIED`

## `openathor adopt --dry-run`

### 用途

扫描已有小说目录，识别章节、设定、灵感、废稿和未知文件，但不修改任何用户文件。

### 参数

```bash
openathor adopt --dry-run [path] [--json]
```

- `path`：目标目录。省略时使用当前目录。

### Output data

`data` 必须包含：

- `detected_chapters`
- `detected_notes`
- `detected_style_references`
- `unclassified`
- `questions`
- `planned_writes`
- `confidence_summary`

### Expected writes

无实际写入。`writes` 必须为空。

### Errors

- `OA_ADOPT_NO_FILES_FOUND`
- `OA_ADOPT_UNREADABLE_PATH`
- `OA_PROJECT_ALREADY_EXISTS`

## `openathor adopt`

### 用途

把已有小说非侵入式接入 OpenAthor。默认不移动、不重命名、不重写原稿。

### 参数

```bash
openathor adopt [path] [--json] [--confirm-ambiguous]
```

- `path`：目标目录。省略时使用当前目录。
- `--confirm-ambiguous`：允许在仍有 ambiguous 文件时继续写入 questions。

### Expected writes

实际写入时可以创建：

- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- `.openathor/import-report.md`
- `bible/canon.pending.md`
- `bible/style.md`
- `outline/chapters.yaml`
- `notes/import-questions.md`
- `runs/run_*.json`

不得写入或移动原始正文文件。

### Errors

- `OA_ADOPT_AMBIGUOUS_CHAPTER_ORDER`
- `OA_ADOPT_DUPLICATE_CHAPTER`
- `OA_ADOPT_UNSUPPORTED_FILE_TYPE`
- `OA_WRITE_PERMISSION_DENIED`

## `openathor doctor`

### 用途

检查项目是否符合协议，给 Pi Agent 一个可靠项目状态。

### 参数

```bash
openathor doctor [--json] [--strict]
```

- `--strict`：warning 也导致非零退出码，用于 CI 或 fixture check。

### Checks

必须检查：

- `openathor.yaml` 存在且可解析
- `protocol_version` 受支持
- 必要目录存在
- `paths.*` 指向合法相对路径
- `outline/chapters.yaml` 可解析
- `.openathor/manuscript.index.yaml` 可解析
- chapter ID 唯一
- `display_order` 无重复
- `source_path` 指向存在文件或合法 planned 状态
- derived index 是否过期

### Expected writes

无。`writes` 必须为空。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_PROTOCOL_UNSUPPORTED`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_DUPLICATE_ID`
- `OA_MANUSCRIPT_MISSING_SOURCE`
- `OA_INDEX_STALE`

`OA_INDEX_STALE` 默认是 warning，`--strict` 下可变为错误。

## `openathor index rebuild`

### 用途

从明文事实源重建 `.openathor/index.sqlite`。

### 参数

```bash
openathor index rebuild [--json] [--dry-run]
```

### Expected writes

实际写入时可以创建或替换：

- `.openathor/index.sqlite`

不得修改任何事实源文件。

### Index scope

Slice 1 SQLite 只需要保存确定性索引：

- project metadata
- chapter ID 到 source path 映射
- file hash
- display order
- status
- basic file classification

不需要保存唯一用户内容，不需要向量检索。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_INDEX_REBUILD_FAILED`
- `OA_WRITE_PERMISSION_DENIED`

## Fixture Contract

Slice 1 必须用以下 fixtures 验证：

- `new-project`
- `adopt-3-chapters`
- `scattered-drafts`
- `adopt-ambiguous-order`

每个 fixture 必须包含：

- `input/`
- `expected/commands.yaml`
- `expected/files.yaml`
- `expected/doctor.json`
- `expected/disallowed.yaml`

## Blocking Failure

以下行为直接阻塞 Slice 1：

- `adopt --dry-run` 写入任何文件
- `adopt` 移动、重命名或重写用户原稿
- `doctor --json` 输出非 JSON 内容
- `index rebuild` 保存唯一用户内容
- 缺少 stable chapter ID
- ambiguous 文件被静默当作正文或 canon
