# MVP Scope

## 非目标

第一阶段不做：

- 自研 TUI
- 网页编辑器
- VSCode 插件
- Obsidian 插件
- 多 agent 适配
- 云端协作
- 模板市场
- 发布平台
- 一键生成整本书
- 复杂版权、投稿、商业化发行流程

这些能力不是永远不做，而是不进入 Pi Agent 优先阶段。

## MVP 范围

第一版建议只包含：

- `openathor init`
- `openathor adopt --dry-run`
- `openathor adopt`
- `openathor doctor`
- `openathor skill install pi`
- `openathor context`
- `openathor plan`
- `openathor draft`
- `openathor review`
- `openathor revise`
- `openathor canon sync`
- `openathor export --format markdown`

## MVP 成功标准

MVP 的成功标准不是“能不能生成很长的小说”，而是：

- Pi Agent 能稳定识别 OpenAthor 项目
- Pi Agent 能按 skill 正确调用 CLI
- 用户可以在外部编辑器中持续编辑
- agent 修改不会轻易覆盖用户内容
- 已有小说可以被非侵入式接管
- 每次写作和修改都有可追踪记录
- bible、outline、manuscript、reviews 能形成闭环

更具体地说：

> 一个用户把写了 30 章的小说丢进来，Pi Agent 能接管、总结、发现设定、继续写第 31 章，并且不把前文写崩。

## 后续扩展

当 Pi Agent 路径验证成立后，可以再考虑：

- 适配 Codex、Claude Code、Cursor
- 提供 MCP server
- 提供 VSCode/Obsidian 插件
- 增加云端同步
- 增加项目备份和版本历史
- 增加模板库
- 增加多人协作
- 增加 EPUB、DOCX、PDF 导出

扩展顺序建议是：

```text
Pi Skill + CLI
  -> MCP
  -> 其他 agent skill
  -> 编辑器插件
  -> 云平台
```
