# Target Scope

## 产品轨道

OpenAthor 当前产品轨道是 Pi Agent first。

第一目标形态：

```text
用户自选文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + OpenAthor Project Protocol
```

这不是一个临时最小版本，而是目标产品形态的第一条完整路径。后续可以扩展到 MCP、其他 agent、编辑器插件和云能力，但不能反向改变这条路径的协议基础。

## 当前不做

当前产品轨道不做：

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

这些能力不是永远不做，而是不能抢占 Pi Agent first 的目标闭环。

## 目标能力

目标产品需要覆盖：

- 从零创建小说项目
- 非侵入式接管已有小说
- 从散稿目录识别正文、设定、灵感和废稿
- 稳定维护 volume、chapter、scene 和 story assets
- 继续写下一章
- 审查已有章节
- 局部改稿
- 同步新增设定到 canon
- 识别 canon 冲突
- 从中途重规划后续剧情
- 插入、移动、归档、拆分和合并章节
- 基于结构化和语义检索生成 context
- 导出完整 Markdown

## 首个完整纵切

实现可以分期，但首个纵切必须证明核心闭环成立：

- Pi Agent 能稳定识别 OpenAthor 项目
- Pi Agent 能按 skill 正确调用 CLI
- 用户可以继续使用外部编辑器
- agent 修改不会轻易覆盖用户内容
- 已有小说可以被非侵入式接管
- SQLite 索引可以从明文文件重建
- 每次写作和修改都有可追踪记录
- bible、outline、manuscript、reviews 和 runs 能形成闭环

更具体地说：

> 一个用户把写了 30 章的小说丢进来，Pi Agent 能接管、总结、发现设定、继续写第 31 章，并且不把前文写崩。

## 后续扩展顺序

扩展顺序建议：

```text
Pi Skill + CLI + Project Protocol
  -> MCP
  -> 其他 agent skill
  -> 编辑器插件
  -> 云平台
```

任何扩展都应复用 Project Protocol 和 CLI Contract，而不是建立另一套事实源或命令语义。
