# Slice 4 Search

## 目标

`openathor search text` 提供确定性文本检索，让 Pi Agent 可以按关键词找到正文、设定、notes、reviews、outline 和 canon 中的相关来源。

`openathor search related` 提供确定性相关检索，用目标章节的词项重叠找到可能相关的前文和项目资料。

`openathor search semantic` 提供可选派生向量索引检索。当前实现使用本地 deterministic hash embedding，不调用模型服务；索引由 `openathor index rebuild --vector` 从明文事实源重建。

search 命令只读，不写用户文件。

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
