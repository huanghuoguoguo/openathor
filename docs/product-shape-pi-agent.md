# OpenAthor 产品形态：Pi Agent 优先

本文档是产品形态文档的路由页。详细内容拆分在 `docs/product-shape-pi-agent/` 下。

## 一句话定位

OpenAthor 是一个面向 Pi Agent 的小说创作项目协议、Skill 包和 CLI 工具层，让 Pi Agent 可以稳定地理解、续写、审稿和维护一部长篇小说。

## 核心产品形态

```text
用户自选文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + OpenAthor Project Protocol
```

当前产品轨道只围绕 Pi Agent 成立，不做自研 TUI，不做网页编辑器，不主动适配其他 agent。

## 阅读顺序

1. [Overview](product-shape-pi-agent/overview.md)：产品定位、边界和核心判断
2. [User Workflows](product-shape-pi-agent/user-workflows.md)：新建项目、接管已有小说、对话式创作
3. [Components](product-shape-pi-agent/components.md)：项目协议、Pi Skill、CLI、外部编辑器
4. [Outline And Assets](product-shape-pi-agent/outline-and-assets.md)：大纲、章节、场景和资产关联管理
5. [Storage And Retrieval](product-shape-pi-agent/storage-and-retrieval.md)：明文文件、SQLite 索引和向量检索的边界
6. [Sub-agent Extension](product-shape-pi-agent/sub-agent-extension.md)：Pi sub-agent 可选增强层
7. [Pi Agent Behavior](product-shape-pi-agent/pi-agent-behavior.md)：Pi Agent 应遵守的行为规范
8. [Core Scenarios](product-shape-pi-agent/core-scenarios.md)：目标产品必须覆盖的核心用户场景
9. [Target Scope](product-shape-pi-agent/target-scope.md)：目标范围、当前不做和首个完整纵切
10. [Principles](product-shape-pi-agent/principles.md)：产品原则
11. [Open Questions](product-shape-pi-agent/open-questions.md)：待评估问题

## 当前结论

OpenAthor 当前产品轨道应当是一个 Pi Agent 原生的小说创作工具链，而不是独立应用。

目标产品形态是：

```text
OpenAthor Project Protocol
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + 用户自选文本编辑器
```

这个形态足够聚焦，也更符合用户实际写作习惯。它把成本集中在最有价值的部分：长篇小说项目结构、上下文组织、canon 维护、审稿和可控改稿。

实现可以分期，但分期必须来自目标形态，不能为了局部命令临时改变协议、事实源或 CLI 语义。
