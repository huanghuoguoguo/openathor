# Slice 3 Structural Editing

## 目标

`openathor outline` 命令提供确定性结构检查和安全归档能力。

当前实现只覆盖最小闭环：

- 查看章节大纲
- 归档前影响分析
- 用户确认后的章节归档

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
- `fact_candidates`
- `direct_references`
- `related_context`
- `following_chapters`

### Expected writes

无。

`writes` 必须为空。

### 当前限制

- 影响分析是确定性文本扫描。
- `direct_references` 只匹配章节 ID、标题、display order 和正文路径。
- `related_context` 使用词项重叠，不是语义向量检索。
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

## 未实现命令

以下目标命令仍待实现：

- `openathor outline insert`
- `openathor outline move`
- `openathor outline split`
- `openathor outline merge`
- `openathor outline replan`
