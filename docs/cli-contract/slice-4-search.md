# Slice 4 Search

## 目标

`openathor search text` 提供确定性文本检索，让 Pi Agent 可以按关键词找到正文、设定、notes、reviews、outline 和 canon 中的相关来源。

`openathor search related` 提供确定性相关检索，用目标章节的词项重叠找到可能相关的前文和项目资料。

`openathor search semantic` 提供可选派生向量索引检索。当前实现使用本地 deterministic hash embedding，不调用模型服务；索引由 `openathor index rebuild --vector` 从明文事实源重建。

`openathor assets audit` 提供长篇资产连续性审计。它把 `bible/characters.md`、`bible/timeline.md`、`notes/hooks.md`、`outline/chapters.yaml` 和正文提及放在一起扫描，用来发现资产没有沉淀、outline link 悬空、正文出现人物但大纲未关联等漂移风险。

`openathor assets sync` 提供写作后资产沉淀入口。它接收 Pi Agent、Operator 或用户生成的结构化资产包，默认写入 pending proposal；只有用户确认且章节 source hash 匹配时，才把新人物、时间线事件、伏笔和章节 outline links 写入明文事实源。

search 和 assets audit 命令只读，不写用户文件。assets sync 是受确认和 hash gate 保护的写命令。

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
- 人物、timeline 和 hook 支持 `char_` / `ev_` / `hook_` 前缀、Markdown 标题、`## 名称 (id)` 以及 Pi 常写的 `- id: ...` + `name:` / `title:` 列表块。
- `summary_drift` 是复核提示，不代表自动判定正文错误。

## `openathor assets sync`

### 参数

```bash
openathor assets sync chapter <target> --from <asset-package.yaml|json> [--json] [--dry-run]
openathor assets sync chapter <target> --from <asset-package.yaml|json> --confirm --base-hash <sha256:...> [--json] [--dry-run]
```

`--from` 必须是项目内安全相对路径。资产包是结构化 JSON/YAML，当前支持：

- `characters[]`：`id`、`name`、`role`、`traits`、`current_state`、`notes`
- `timeline_events[]`：`id`、`title`、`summary`、`notes`
- `hooks[]`：`id`、`title`、`status`、`summary`、`notes`
- `chapter.summary`
- `chapter.links.characters`
- `chapter.links.timeline_events`
- `chapter.links.hooks`

CLI 不从自然语言正文里推断复杂事实；资产包必须由 agent 或用户显式提供。

### Proposal 模式

不带 `--confirm` 时：

- 写 `runs/run_*_assets_sync.json`
- 追加 `bible/canon.pending.md`
- 不修改 `bible/characters.md`
- 不修改 `bible/timeline.md`
- 不修改 `notes/hooks.md`
- 不修改 `outline/chapters.yaml`

输出必须包含 `source_hash`、`result`、`sync.package` 和 `user_confirmation_required: true`。

### Confirmed write

带 `--confirm --base-hash` 且 hash 匹配时可以写：

- `bible/characters.md`：只追加新增人物
- `bible/timeline.md`：只追加新增时间线事件
- `notes/hooks.md`：只追加新增伏笔
- `outline/chapters.yaml`：更新目标章节摘要和 links
- `bible/canon.pending.md`：仅保存已有资产的更新候选，不直接改写已有 confirmed 资产
- `runs/run_*_assets_sync.json`

hash 不匹配时返回 `OA_MANUSCRIPT_CHANGED` 且不得写入。

### Expected writes

proposal 模式：

- `runs/run_*_assets_sync.json`
- `bible/canon.pending.md`

confirmed write 模式：

- `runs/run_*_assets_sync.json`
- `bible/characters.md`
- `bible/timeline.md`
- `notes/hooks.md`
- `outline/chapters.yaml`
- `bible/canon.pending.md`，仅当资产包包含已有资产的更新候选

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_CONTEXT_TARGET_REQUIRED`
- `OA_CONTEXT_TARGET_NOT_FOUND`
- `OA_ASSETS_SYNC_PACKAGE_REQUIRED`
- `OA_ASSETS_SYNC_PACKAGE_NOT_FOUND`
- `OA_ASSETS_SYNC_PACKAGE_INVALID`
- `OA_BASE_HASH_REQUIRED`
- `OA_MANUSCRIPT_CHANGED`

### 当前限制

- `assets sync` 不从正文自动抽取复杂事实，只处理结构化资产包。
- 确认写入只追加新资产；已有资产状态更新进入 pending，不直接覆盖原档案。
- 资产包 schema 当前只覆盖人物、时间线事件、伏笔和章节 outline links，地点、组织、道具等资产后续扩展。
