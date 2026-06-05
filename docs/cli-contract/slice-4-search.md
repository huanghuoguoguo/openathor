# Slice 4 Search

## 目标

`openathor search text` 提供确定性文本检索，让 Pi Agent 可以按关键词找到正文、设定、notes、reviews、outline 和 canon 中的相关来源。

`openathor search related` 提供确定性相关检索，用目标章节的词项重叠找到可能相关的前文和项目资料。

`openathor search semantic` 提供可选派生向量索引检索。当前实现使用本地 deterministic hash embedding，不调用模型服务；索引由 `openathor index rebuild --vector` 从明文事实源重建。

`openathor assets audit` 提供长篇资产连续性审计。它把 `bible/characters.md`、`bible/timeline.md`、`notes/hooks.md`、`outline/chapters.yaml` 和正文提及放在一起扫描，用来发现资产没有沉淀、outline link 悬空、正文出现人物但大纲未关联等漂移风险。

search 和 assets audit 命令只读，不写用户文件。

## `openathor search text`

### 参数

```bash
openathor search text <query> [--json] [--limit <count>] [--max-chars <count>]
```

### Output data

`data` 包含：

- `query`
- `limit`
- `match_count`
- `truncated`
- `matches`

每个 match 包含：

- `path`
- `hash`
- `line`
- `column`
- `snippet`

`sources` 必须包含有命中的文件和 hash。

### Expected writes

无。

`writes` 必须为空。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_SEARCH_QUERY_REQUIRED`

## 当前限制

- 只做大小写不敏感的文本匹配。
- `search related` 使用 deterministic term overlap，不是语义向量检索。
- `search semantic` 使用本地 deterministic hash embedding，不是外部模型 embedding。

## `openathor search related`

### 参数

```bash
openathor search related chapter <target> [--json] [--limit <count>] [--max-chars <count>]
```

### Output data

`data` 包含：

- `scope`
- `target`
- `method`
- `limit`
- `match_count`
- `target_terms`
- `matches`

每个 match 包含：

- `path`
- `hash`
- `score`
- `shared_terms`
- `snippet`

### Expected writes

无。

`writes` 必须为空。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_CONTEXT_TARGET_REQUIRED`
- `OA_CONTEXT_TARGET_NOT_FOUND`
- `OA_SEARCH_UNSUPPORTED_SCOPE`
- `OA_SEARCH_RELATED_NO_TERMS`

## `openathor index rebuild --vector`

### 参数

```bash
openathor index rebuild [--json] [--dry-run] [--vector]
```

`--vector` 会额外重建 `.openathor/vector/index.json`。

### Output data

`data` 包含：

- `dry_run`
- `planned_writes`
- `chapters_indexed`
- `sqlite_index`
- `vector_index`
- `vector_documents_indexed`

### Expected writes

传入 `--vector` 且非 dry-run 时：

- `.openathor/index.sqlite`
- `.openathor/vector/index.json`

`.openathor/vector/index.json` 是可删除、可重建的派生索引，不保存唯一用户内容。

`index rebuild` 也会从 `outline/chapters.yaml` 和正文文件重建 `.openathor/manuscript.index.yaml`，然后再生成 SQLite 和可选向量索引。长篇写作中如果 agent 写了新章和 outline 但漏同步 manuscript index，重建命令必须让后续 `context`、`search` 和 `export` 能看到该章节。

## `openathor search semantic`

### 参数

```bash
openathor search semantic <query> [--json] [--limit <count>] [--max-chars <count>]
```

### Output data

`data` 包含：

- `query`
- `method`
- `vector_index`
- `limit`
- `match_count`
- `query_terms`
- `matches`

每个 match 包含：

- `path`
- `hash`
- `kind`
- `title`
- `score`
- `shared_terms`
- `snippet`

### Expected writes

无。

`writes` 必须为空。

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_SEARCH_QUERY_REQUIRED`
- `OA_VECTOR_INDEX_NOT_FOUND`
- `OA_VECTOR_INDEX_INVALID`

## `openathor assets audit`

### 参数

```bash
openathor assets audit [--json] [--max-chars <count>]
```

### Output data

`data.audit` 包含：

- `version`
- `generated_at`
- `method`
- `read_only`
- `asset_files`
- `assets`
- `counts`
- `outline_link_issues`
- `chapter_entity_coverage`
- `summary_drift`
- `unlinked_characters`

`counts` 至少包含：

- `chapters`
- `indexed_chapters`
- `characters`
- `timeline_events`
- `hooks`
- `unresolved_outline_links`
- `character_link_drifts`
- `summary_drift_candidates`

### Warnings

- `OA_ASSET_LINK_UNRESOLVED`：outline link 指向不存在的 story asset。
- `OA_ASSET_CHARACTER_LINK_DRIFT`：正文或章节摘要提到已登记人物，但该章节 outline links 未关联。
- `OA_ASSET_SUMMARY_DRIFT`：章节摘要词项和正文弱匹配，需要人工复核。

这些 warning 是确定性审计结果，不会自动修改正文、outline 或 confirmed canon。

### Expected writes

无。

`writes` 必须为空。

### 当前限制

- `assets audit` 只做 Markdown/YAML 文本扫描，不做完整语义事实推理。
- 人物、timeline 和 hook 优先通过稳定 ID 前缀和 Markdown 标题识别。
- `summary_drift` 是复核提示，不代表自动判定正文错误。
