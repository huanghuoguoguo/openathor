# Slice 3 Structural Editing

## 目标

`openathor outline` 命令提供确定性结构检查和安全结构编辑能力。

当前实现只覆盖最小闭环：

- 查看章节大纲
- 插入 planned 章节
- 移动章节展示顺序
- 生成拆章 proposal
- 用户确认后的拆章写入
- 生成合章 proposal
- 生成重规划 proposal
- 用户确认后的 planned future outline 重规划写入
- 归档前影响分析
- 用户确认后的章节归档

插章只修改结构化元数据，不创建正文文件，不移动、不重命名、不删除已有正文文件。

移章只修改结构化元数据中的 `display_order`，不移动、不重命名、不删除已有正文文件。

拆章默认只生成 proposal。只有显式传入 `--confirm --base-hash` 时才写入，并且只修改目标正文、创建后一段新正文、更新 outline/index 和写入 run record。

合章默认生成 proposal，用户确认且 hash 匹配时可以合并相邻章节正文并归档后一章。

重规划默认只生成 proposal。用户确认且 `outline/chapters.yaml` hash 匹配时，可以用结构化 package 替换 `--from` 及之后的 planned 章节；不修改正文文件，不替换 drafted/revised 章节。

归档只修改结构化元数据，不移动、不重命名、不删除正文文件。

## `openathor outline show`

### 参数

```bash
openathor outline show [--json]
```

### Output data

`data.outline` 包含：

- `version`
- `chapter_count`
- `active_chapter_count`
- `archived_chapter_count`
- `chapters`

每个 chapter 包含：

- `id`
- `display_order`
- `title`
- `status`
- `manuscript_path`
- `source_path`
- `content_hash`
- `confidence`
- `summary`
- `scenes`
- `links`

### Expected writes

无。

`writes` 必须为空。

## `openathor outline impact`

### 参数

```bash
openathor outline impact <target> [--json] [--max-chars <count>]
```

`target` 可以是章节 ID 或 display order。

### Output data

`data` 包含：

- `scope`
- `target`
- `read_only`
- `default_action`
- `method`
- `reference_terms`
- `target_terms`
- `impact`
- `match_count`
- `recommendations`

`impact` 包含：

- `manuscript_file`
- `outline_status_change`
- `index_status_change`
- `structural_links`
- `story_asset_impact`
- `fact_candidates`
- `direct_references`
- `related_context`
- `following_chapters`

`story_asset_impact` 包含：

- `linked_assets.characters`
- `linked_assets.timeline_events`
- `linked_assets.hooks`
- `unknown_links`
- `following_asset_references`

`linked_assets` 会把目标章节 outline links 解析到已登记人物、时间线和伏笔资产，包含资产名称、ID、来源文件和档案字段名。`following_asset_references` 会列出后续章节中继续引用目标章节同一人物、时间线或伏笔的章节，帮助用户归档前判断哪些故事资产仍被后文承接。

### Expected writes

无。

`writes` 必须为空。

### 当前限制

- 影响分析是确定性文本扫描。
- `direct_references` 只匹配章节 ID、标题、display order 和正文路径。
- `related_context` 使用词项重叠，不是语义向量检索。
- `story_asset_impact` 只解析 outline links 中已有的人物、timeline 和 hook 引用，不从正文推断新资产。
- `fact_candidates` 是文本候选，不会自动写入 confirmed canon。

## `openathor outline archive`

### 参数

```bash
openathor outline archive <target> [--json] [--keep-facts] [--confirm] [--dry-run] [--diff] [--base-hash <hash>]
```

默认行为是不写入，只返回 proposal 和 planned writes。

只有传入 `--confirm` 且没有 `--dry-run` 或 `--diff` 时才写入。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `target`
- `keep_facts`
- `manuscript_file_deleted`
- `result`
- `user_confirmation_required`
- `planned_writes`
- `diff`
- `next_agent_action`

`result` 标明本次是否已应用、应用后的 outline/index 状态，以及正文文件是否被删除。

### Confirmed writes

确认写入时：

- 修改 `outline/chapters.yaml` 中目标章节 `status` 为 `archived`
- 修改 `.openathor/manuscript.index.yaml` 中目标章节 `status` 为 `archived`
- 写入 `runs/run_*_outline_archive.json`
- 不删除正文文件
- 不移动正文文件
- 不修改 confirmed canon

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_MANUSCRIPT_CHANGED`

## `openathor outline insert`

### 参数

```bash
openathor outline insert --after <target> --title <title> [--json] [--confirm] [--dry-run] [--diff]
```

`--after` 可以是章节 ID 或 display order。默认行为是不写入，只返回 proposal 和 planned writes。

只有传入 `--confirm` 且没有 `--dry-run` 或 `--diff` 时才写入。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `after`
- `inserted`
- `result`
- `user_confirmation_required`
- `planned_writes`
- `diff`
- `next_agent_action`

`inserted` 是新增 planned 章节：

- `id`
- `display_order`
- `title`
- `status: planned`
- `manuscript_path: null`

### Confirmed writes

确认写入时：

- 在 `outline/chapters.yaml` 新增 planned 章节
- 顺延后续章节在 `outline/chapters.yaml` 中的 `display_order`
- 顺延后续已有正文在 `.openathor/manuscript.index.yaml` 中的 `display_order`
- 写入 `runs/run_*_outline_insert.json`
- 不创建正文文件
- 不移动、重命名或删除已有正文文件
- 不修改 confirmed canon

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_OUTLINE_TITLE_REQUIRED`

## `openathor outline move`

### 参数

```bash
openathor outline move <target> --after <target> [--json] [--confirm] [--dry-run] [--diff]
```

第一个 `<target>` 是要移动的章节 ID 或 display order。`--after` 是移动后的前置章节 ID 或 display order。

默认行为是不写入，只返回 proposal 和 planned writes。

只有传入 `--confirm` 且没有 `--dry-run` 或 `--diff` 时才写入。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `target`
- `after`
- `result`
- `user_confirmation_required`
- `planned_writes`
- `diff`
- `next_agent_action`

`result` 标明本次是否已应用、目标章节的 display order 变化、所有受影响章节，以及是否移动正文文件。

### Confirmed writes

确认写入时：

- 更新 `outline/chapters.yaml` 中受影响章节的 `display_order`
- 更新 `.openathor/manuscript.index.yaml` 中受影响已有正文的 `display_order`
- 写入 `runs/run_*_outline_move.json`
- 不移动、重命名或删除已有正文文件
- 不修改 confirmed canon

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_OUTLINE_MOVE_INVALID`

## `openathor outline split`

### 参数

```bash
openathor outline split <target> --at-line <line> --title-before <title> --title-after <title> [--json] [--confirm] [--dry-run] [--diff] [--max-chars <count>] [--base-hash <hash>]
```

`target` 可以是章节 ID 或 display order。`--at-line` 是第二段正文的第一行。

默认行为是不写入，只返回 proposal 和 planned writes。

只有传入 `--confirm --base-hash <current-hash>` 且没有 `--dry-run` 或 `--diff` 时才写入。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `target`
- `split_at_line`
- `line_count`
- `before`
- `after`
- `result`
- `user_confirmation_required`
- `confirmed_write_supported`
- `planned_writes`
- `diff`
- `next_agent_action`

`before` 和 `after` 包含拆分后两段的标题、行号范围、字符数、预览文本和是否以 Markdown heading 开头。

proposal 模式下，`result` 标明本次没有应用文件变更：

- `applied: false`
- `manuscript_file_modified: false`
- `manuscript_files_created: false`
- `outline_modified: false`
- `index_modified: false`

### Confirmed writes

确认写入时：

- 修改目标章节原正文文件，只保留 `--at-line` 之前的文本
- 创建后一段新正文文件
- 修改 `outline/chapters.yaml`：更新目标章节标题和新增后一段章节
- 新增后一段章节继承原章节的 `summary`、`scenes` 和 `links`，避免拆章时静默丢失人物、timeline 或 hook 引用；拆章后可再用 `assets sync` / `assets audit` 细化归属
- 修改 `.openathor/manuscript.index.yaml`：更新目标章节 hash、新增后一段章节，并顺延后续 display order
- 写入 `runs/run_*_outline_split.json`
- 不修改 confirmed canon
- 不删除、移动或重命名其他正文文件

proposal、`--dry-run` 和 `--diff` 模式下 `writes` 必须为空。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_OUTLINE_TITLE_REQUIRED`
- `OA_OUTLINE_SPLIT_SOURCE_REQUIRED`
- `OA_OUTLINE_SPLIT_LINE_REQUIRED`
- `OA_OUTLINE_SPLIT_INVALID`
- `OA_BASE_HASH_REQUIRED`
- `OA_MANUSCRIPT_CHANGED`
- `OA_MANUSCRIPT_TARGET_EXISTS`

## `openathor outline merge`

### 参数

```bash
openathor outline merge <target> <next> [--title <title>] [--json] [--dry-run] [--diff] [--max-chars <count>] [--confirm --base-hash <hash> --next-base-hash <hash>]
```

`target` 和 `next` 必须是相邻章节。默认只生成 proposal；`--confirm` 会把 `next` 的正文合并进 `target` 的正文文件，把 `target` 标记为 `revised`，把 `next` 标记为 `archived`，并更新 outline、manuscript index 和 run record。被合并章节的原正文文件保留，不物理删除。

confirmed merge 必须同时提供：

- `--base-hash`：`target` 当前正文 hash。
- `--next-base-hash`：`next` 当前正文 hash。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `target`
- `next`
- `merged`
- `result`
- `user_confirmation_required`
- `confirmed_write_supported`
- `planned_writes`
- `diff`
- `next_agent_action`

### Expected writes

默认 proposal 无写入。

confirmed merge 写入：

- `target` 正文文件
- `outline/chapters.yaml`
- `.openathor/manuscript.index.yaml`
- `runs/run_<stamp>_outline_merge.json`

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_OUTLINE_MERGE_INVALID`
- `OA_OUTLINE_MERGE_SOURCE_REQUIRED`
- `OA_BASE_HASH_REQUIRED`
- `OA_MANUSCRIPT_CHANGED`

## `openathor outline replan`

### 参数

```bash
openathor outline replan --from <target> --task <text> [--json] [--dry-run] [--diff] [--max-chars <count>]
openathor outline replan --from <target> --task <text> --from-package <replan-package.yaml|json> --confirm --base-hash <sha256:...> [--json]
```

`--from` 是重规划开始章节。默认只生成 proposal，不写文件。

confirmed replan 需要结构化 JSON/YAML package：

```yaml
chapters:
  - title: 调车场疑影
    summary: 林岚去旧站台后的调车场核对匿名电话来源。
    links:
      hooks:
        - hook-old-platform-call
```

确认写入只允许替换 `--from` 及之后的 planned 章节。若边界内包含 drafted/revised 章节、章节已有 `manuscript_path`，或已在 `.openathor/manuscript.index.yaml` 中登记，CLI 返回 `OA_OUTLINE_REPLAN_UNSAFE`，不会写文件。

### Output data

`data` 包含：

- `dry_run`
- `mode`
- `command`
- `task`
- `from`
- `affected_chapters`
- `result`
- `user_confirmation_required`
- `confirmed_write_supported`
- `replacement_chapters`
- `planned_writes`
- `diff`
- `next_agent_action`

### Expected writes

默认 proposal、`--dry-run`、`--diff` 无写入。

confirmed replan 写入：

- `outline/chapters.yaml`
- `runs/run_<stamp>_outline_replan.json`

confirmed replan 不写 `.openathor/manuscript.index.yaml`，不创建/删除/移动/改写正文文件，不修改 confirmed canon。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_OUTLINE_TARGET_REQUIRED`
- `OA_OUTLINE_TARGET_NOT_FOUND`
- `OA_TASK_REQUIRED`
- `OA_OUTLINE_REPLAN_PACKAGE_REQUIRED`
- `OA_OUTLINE_REPLAN_PACKAGE_NOT_FOUND`
- `OA_OUTLINE_REPLAN_PACKAGE_INVALID`
- `OA_BASE_HASH_REQUIRED`
- `OA_OUTLINE_CHANGED`
- `OA_OUTLINE_REPLAN_UNSAFE`
