# Slice 4 Search

## 目标

`openathor search text` 提供确定性文本检索，让 Pi Agent 可以按关键词找到正文、设定、notes、reviews、outline 和 canon 中的相关来源。

`openathor search related` 提供确定性相关检索，用目标章节的词项重叠找到可能相关的前文和项目资料。

`openathor search semantic` 提供可选派生向量索引检索。当前实现使用本地 deterministic hash embedding，不调用模型服务；索引由 `openathor index rebuild --vector` 从明文事实源重建。

`openathor assets audit` 提供长篇资产连续性审计。它把 `bible/characters.md`、`bible/timeline.md`、`notes/hooks.md`、`outline/chapters.yaml` 和正文提及放在一起扫描，用来发现资产没有沉淀、outline link 悬空、正文出现人物但大纲未关联等漂移风险。

`openathor assets sync` 提供写作后资产沉淀入口。它接收 Pi Agent、Operator 或用户生成的结构化资产包，默认写入 pending proposal；只有用户确认且章节 source hash 匹配时，才把新人物、时间线事件、伏笔、既有资产状态更新和章节 outline links 写入明文事实源。

`openathor assets link-backfill` 提供已确认人物的确定性 outline link 回填入口。它用于接管长篇既有正文后，人物档案已经存在但旧章节 outline links 为空或不全的场景。

search 和 assets audit 命令只读，不写用户文件。assets sync 和 assets link-backfill 是受确认和 hash gate 保护的写命令。

`exports/` 是 CLI 导出的派生产物目录，不进入 `search text`、`search related` 或 `index rebuild --vector` 的检索候选，避免导出文件反向污染后续检索结果。

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
- `asset_link_coverage_issues`
- `chapter_entity_coverage`
- `character_profile_coverage`
- `character_profile_summary`
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
- `weak_asset_link_coverages`
- `weak_character_profile_coverages`
- `weak_character_profile_summaries`
- `summary_drift_candidates`

### Warnings

- `OA_ASSET_LINK_UNRESOLVED`：outline link 指向不存在的 story asset。
- `OA_ASSET_CHARACTER_LINK_DRIFT`：正文或章节摘要提到已登记人物，但该章节 outline links 未关联。
- `OA_ASSET_LINK_WEAK_COVERAGE`：章节 outline 已链接人物、timeline event 或 hook，但当前章节标题和正文对该资产的直接提及与词项覆盖很弱。结构拆章后复制 links 时常见，需要复核是修剪 links、补写正文，还是用 `assets sync` 更新章节资产。
- `OA_ASSET_CHARACTER_PROFILE_WEAK`：人物档案在相关章节的项目级文本覆盖偏弱，且匹配到的档案字段数不足，需要人工复核人物性格、事迹或当前状态是否已经被承接。
- `OA_ASSET_SUMMARY_DRIFT`：章节摘要词项和正文弱匹配，或摘要含有正文未支持的否定/降级断言，需要人工复核。

这些 warning 是确定性审计结果，不会自动修改正文、outline 或 confirmed canon。

### Expected writes

无。

`writes` 必须为空。

### 当前限制

- `assets audit` 只做 Markdown/YAML 文本扫描，不做完整语义事实推理。
- 人物、timeline 和 hook 支持 `char_` / `ev_` / `event_` / `hook_` 前缀、Markdown 标题、`## 名称 (id)` 以及 Pi 常写的 `- id: ...` + `name:` / `title:` 列表块。
- `asset_link_coverage_issues` 是低严重度复核信号，不会自动删除 outline links。它只看章节标题和正文，不把 outline summary 当成支撑证据；这样结构拆章后继承的 summary/links 如果没有被正文承接，会被提示出来。
- 对人物资产，`assets audit` 会解析 `role`、`traits`、`current_state`、`note`、`背景`、`性格`、`秘密` 等档案字段，并为已链接章节输出 `character_profile_coverage`，为每个人物输出项目级 `character_profile_summary`。章节级 `weak_character_profile_coverages` 只统计术语覆盖很低且没有命中任何档案字段的章节，避免把人物稳定身份没有在每章重复写作误报成漂移。项目级 weak summary 需要同时满足词项覆盖偏低和档案字段命中数不足；如果角色身份、性格或状态字段已经被全项目文本命中，只保留 coverage 数据，不发 weak warning。这些数据只作为确定性文本覆盖证据，不替代人工或 LLM judge 的语义判断。
- `character_profile_summary` 按人物资产顺序输出，包含 `linked_chapter_count`、`mentioned_chapter_count`、`matched_profile_field_count`、`coverage_ratio` 和相关章节明细，用于复核一个人物在多章写作后是否仍有稳定可追踪的档案承接。
- `summary_drift` 是复核提示，不代表自动判定正文错误。每条记录包含 `summary_drift_reasons`；当前可能值包括 `weak_term_coverage` 和 `unsupported_summary_assertion`。

## `openathor assets link-backfill`

### 参数

```bash
openathor assets link-backfill characters [--json] [--dry-run]
openathor assets link-backfill characters --confirm --base-hash <sha256:...> [--json] [--dry-run]
```

该命令只支持 `characters`。它读取 `bible/characters.md` 中已确认、可解析出 ID 的人物资产，并扫描每个非 planned 章节的标题、摘要和正文。若章节文本直接出现人物名称，但 `outline/chapters.yaml` 的 `links.characters` 没有该人物 ID 或名称，命令会提出把该人物 ID 加入该章节 links。

### Proposal 模式

不带 `--confirm` 时：

- 写 `runs/run_*_assets_link_backfill.json`
- 不修改 `outline/chapters.yaml`
- 不修改 `bible/characters.md`
- 不修改 `bible/timeline.md`
- 不修改 `notes/hooks.md`
- 不修改任何正文文件

输出包含：

- `source_hash`：当前 `outline/chapters.yaml` hash
- `result.chapters_scanned`
- `result.chapters_modified`
- `result.character_links_added`
- `proposed_changes`
- `user_confirmation_required: true`

### Confirmed write

带 `--confirm --base-hash` 且 hash 匹配时可以写：

- `outline/chapters.yaml`：只补充 `links.characters`
- `runs/run_*_assets_link_backfill.json`

hash 不匹配时返回 `OA_OUTLINE_CHANGED` 且不得写入。

该命令不会新增人物、时间线、伏笔或 canon，也不会从正文推断复杂事实。它只把“已确认人物名称在章节文本中出现”转换为 outline link，作为 adopted 长篇项目的确定性清理工具。

### Expected writes

proposal 模式：

- `runs/run_*_assets_link_backfill.json`

confirmed write 模式：

- `runs/run_*_assets_link_backfill.json`
- `outline/chapters.yaml`

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_ASSETS_LINK_BACKFILL_UNSUPPORTED_KIND`
- `OA_BASE_HASH_REQUIRED`
- `OA_OUTLINE_CHANGED`

## `openathor assets sync`

### 参数

```bash
openathor assets sync chapter <target> --from <asset-package.yaml|json> [--json] [--dry-run]
openathor assets sync chapter <target> --from <asset-package.yaml|json> --confirm --base-hash <sha256:...> --assets-hash <path=sha256:...>... [--json] [--dry-run]
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

为兼容真实 Pi/Operator Agent 输出，读取层也接受两类等价结构：

- `links.characters[]` / `links.timeline_events[]` / `links.hooks[]` 可为字符串 ID，也可为含 `id`、`name`/`title`、`role`、`status`、`description`、`constraints` 等字段的对象。
- `updates.characters[]` / `updates.timeline_events[]` / `updates.hooks[]` 可作为资产增量来源；CLI 会把其中可解析的 `id`、`name`/`title`、`description`、`note`、`new_evidence` 等字段归一化为 canonical `characters`、`timeline_events`、`hooks`。

如果资产包没有 `chapter.summary`、links、characters、timeline_events 或 hooks，CLI 返回 `OA_ASSETS_SYNC_PACKAGE_EMPTY`，避免空资产包被误判为同步成功。

### Proposal 模式

不带 `--confirm` 时：

- 写 `runs/run_*_assets_sync.json`
- 追加 `bible/canon.pending.md`
- 不修改 `bible/characters.md`
- 不修改 `bible/timeline.md`
- 不修改 `notes/hooks.md`
- 不修改 `outline/chapters.yaml`

输出必须包含 `source_hash`、`asset_hashes`、`result`、`sync.package` 和 `user_confirmation_required: true`。`asset_hashes` 列出本次确认写入会修改的资产源文件当前 hash；Operator/Pi Agent 在用户确认后必须把这些 hash 作为 `--assets-hash <path=hash>` 原样带回确认命令。

### Confirmed write

带 `--confirm --base-hash`、所有必要 `--assets-hash` 且 hash 匹配时可以写：

- `bible/characters.md`：追加新增人物；合并更新既有人物 `role`、`traits`、`current_state` 和 `notes`，旧 `current_state` 以 `note: previous_state: ...` 保留
- `bible/timeline.md`：追加新增时间线事件；合并更新既有事件摘要并把旧摘要作为 note 保留
- `notes/hooks.md`：追加新增伏笔；合并更新既有伏笔状态和摘要并把旧状态/摘要作为 note 保留
- `outline/chapters.yaml`：更新目标章节摘要和 links
- `runs/run_*_assets_sync.json`

章节 source hash 不匹配时返回 `OA_MANUSCRIPT_CHANGED` 且不得写入。缺少必要资产源 hash 时返回 `OA_ASSETS_HASH_REQUIRED` 且不得写入。资产源 hash 不匹配时返回 `OA_ASSETS_SOURCE_CHANGED` 且不得写入。

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

### Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_CONTEXT_TARGET_REQUIRED`
- `OA_CONTEXT_TARGET_NOT_FOUND`
- `OA_ASSETS_SYNC_PACKAGE_REQUIRED`
- `OA_ASSETS_SYNC_PACKAGE_NOT_FOUND`
- `OA_ASSETS_SYNC_PACKAGE_INVALID`
- `OA_ASSETS_SYNC_PACKAGE_EMPTY`
- `OA_ASSETS_HASH_INVALID`
- `OA_ASSETS_HASH_REQUIRED`
- `OA_ASSETS_SOURCE_CHANGED`
- `OA_BASE_HASH_REQUIRED`
- `OA_MANUSCRIPT_CHANGED`

### 当前限制

- `assets sync` 不从正文自动抽取复杂事实，只处理结构化资产包。
- 确认写入会合并 OpenAthor 规范 `- id:` 资产块；无法识别的用户自由格式会保留，必要时追加规范资产块。
- 资产包 schema 当前只覆盖人物、时间线事件、伏笔和章节 outline links，地点、组织、道具等资产后续扩展。
