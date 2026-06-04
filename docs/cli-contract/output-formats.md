# Output Formats

CLI 输出要优先服务 Pi Agent 的稳定调用。人类可读输出可以存在，但 agent-facing 合约以 JSON 为准。

## JSON Envelope

所有 `--json` 输出使用统一 envelope：

```json
{
  "ok": true,
  "command": "openathor context",
  "run_id": "run_20260604_001",
  "protocol_version": "0.1",
  "project": {
    "id": "novel_001",
    "root": "/path/to/novel"
  },
  "sources": [
    {
      "path": "outline/chapters.yaml",
      "hash": "sha256:..."
    }
  ],
  "writes": [],
  "warnings": [],
  "data": {}
}
```

## Error Envelope

失败输出仍使用 JSON：

```json
{
  "ok": false,
  "command": "openathor adopt",
  "protocol_version": "0.1",
  "project": null,
  "sources": [],
  "writes": [],
  "warnings": [],
  "error": {
    "code": "OA_ADOPT_AMBIGUOUS_CHAPTER_ORDER",
    "message": "无法可靠判断部分章节顺序。",
    "recoverable": true,
    "hints": [
      "请确认 import report 中列出的文件顺序。"
    ]
  }
}
```

## Diff Output

支持 `--diff` 的命令应输出 unified diff 或在 JSON 中嵌入 diff metadata。

JSON 模式建议：

```json
{
  "ok": true,
  "diff": {
    "format": "unified",
    "files": [
      {
        "path": "bible/canon.pending.md",
        "change_type": "modified",
        "patch": "@@ ..."
      }
    ]
  },
  "requires_confirmation": true
}
```

## Sources

`sources` 应列出 CLI 作出判断时读取的事实源文件。Pi Agent 回复用户时应能说明本次判断来自哪些文件。

## Writes

`writes` 应列出实际写入的文件：

```json
{
  "path": "reviews/chapter-005.md",
  "change_type": "created",
  "reason": "review_output"
}
```

dry-run 不应产生 `writes`，但可以产生 `planned_writes`。

## Warnings

warning 不表示命令失败，但必须暴露给 Pi Agent：

```json
{
  "code": "OA_INDEX_STALE",
  "message": "SQLite 索引过期，context 使用明文重新扫描生成。",
  "severity": "medium"
}
```

## 禁止行为

- 不在 `--json` 中输出非 JSON 文本
- 不省略错误码
- 不把 warning 混在自然语言段落里
- 不只返回最终文本而不返回来源和写入信息
