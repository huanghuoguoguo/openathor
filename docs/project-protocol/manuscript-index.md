# Manuscript Index

`.openathor/manuscript.index.yaml` 用于接管已有小说和维护章节 ID 到正文文件的映射。它是明文索引文件，不是正文事实源。

## 目标格式

```yaml
version: 0.1
generated_at: "2026-06-04T00:00:00Z"
source_mode: adopted

chapters:
  - id: ch_00001
    display_order: 1
    title: 雨夜
    source_path: 正文/001-雨夜.md
    status: existing
    origin: adopted
    content_hash: sha256:...
    detected_title: 雨夜
    confidence: high
  - id: ch_00002
    display_order: 2
    title: 旧案
    source_path: 正文/002-旧案.md
    status: existing
    origin: adopted
    content_hash: sha256:...
    detected_title: 旧案
    confidence: medium

unclassified:
  - path: 灵感/老师身份废稿.md
    reason: possible_draft_or_note

questions:
  - id: import_question_001
    path: 正文/番外.md
    question: 是否作为正文章节接入？
```

## 字段规则

- `id`：OpenAthor 稳定章节 ID
- `display_order`：用户可见章节顺序
- `source_path`：相对项目根目录的正文路径
- `status`：`existing`、`drafted`、`revised`、`archived`
- `origin`：`created`、`adopted`、`standardized`
- `content_hash`：用于检测用户手写冲突
- `confidence`：接管识别置信度

## 接管流程

`openathor adopt --dry-run` 只生成识别结果，不写正文。

`openathor adopt` 可以写入：

- `openathor.yaml`
- `.openathor/manuscript.index.yaml`
- `.openathor/import-report.md`
- `bible/canon.pending.md`
- `notes/import-questions.md`
- 初始 `outline/chapters.yaml`

它不能默认修改、移动或重写用户原稿。

## Hash 和冲突

CLI 在写入正文或基于旧上下文生成 diff 前，应比较 `content_hash`。

如果用户在 agent 运行期间手动修改了文件，CLI 应返回冲突：

```json
{
  "ok": false,
  "error": {
    "code": "OA_MANUSCRIPT_CHANGED",
    "message": "章节 ch_00012 在本次操作期间被用户修改。",
    "recoverable": true
  }
}
```

## 标准化

标准化是可选操作，不是接管前置条件。

如果未来提供标准化命令，它只能在用户明确确认后复制或整理正文到 `manuscript/`，并保留原始路径、来源关系和 run 记录。
