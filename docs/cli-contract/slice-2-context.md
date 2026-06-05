# Slice 2 Context

## 目标

`openathor context` 是写作闭环的第一个只读命令。它为 Pi Agent 生成可审计的上下文包，让后续规划、续写、审稿和改稿基于项目事实源，而不是让 agent 自己扫描全目录拼上下文。

该命令不调用模型、不生成正文、不写文件。

## 命令范围

```bash
openathor context --json
openathor context project --json
openathor context chapter <chapter-id-or-display-order> --json
```

可选参数：

```bash
--max-chars <count>
```

## Output data

`data` 包含：

- `context_pack`：上下文包元数据、scope、target、截断策略和只读 run 说明
- `project`：项目 id、标题、语言和协议版本
- `outline`：章节列表和目标章节
- `canon.confirmed`：`bible/canon.md`
- `canon.pending`：`bible/canon.pending.md`
- `canon.questions`：接管或索引中的待确认问题
- `style`：`bible/style.md`
- `notes`：`notes/` 下的文本资料摘录
- `manuscript.indexed_chapters`：章节索引摘要
- `manuscript.context_chapters`：目标章节及相邻章节正文摘录

`sources` 必须包含用于生成上下文包的文件和 hash。

## Expected writes

无。

`writes` 必须为空。

## Errors

- `OA_PROJECT_NOT_FOUND`
- `OA_SCHEMA_INVALID`
- `OA_CONTEXT_TARGET_REQUIRED`
- `OA_CONTEXT_TARGET_NOT_FOUND`
- `OA_CONTEXT_UNSUPPORTED_SCOPE`

## 当前限制

- 只做确定性上下文包，不做语义检索。
- `chapter` scope 只包含目标章节前后一章。
- 不生成 diff、不改正文、不同步 canon。
- LLM judge 仍需要后续证据包接入。
