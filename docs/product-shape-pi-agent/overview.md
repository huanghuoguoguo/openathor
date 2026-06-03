# Overview

## 背景

OpenAthor 的目标不是重新做一个写作编辑器，也不是重新做一个 agent 终端界面。

第一阶段产品应当只围绕 Pi Agent 成立：用户打开 Pi Agent CLI，在自己熟悉的文本编辑器里编辑小说项目，通过和 Pi Agent 对话来完成规划、续写、审稿、改稿和设定维护。OpenAthor 提供 Pi Agent 可理解、可调用、可验证的一套小说创作工具链。

## 产品边界

第一阶段只支持 Pi Agent，不主动适配 Codex、Claude Code、Cursor 或其他 agent。

OpenAthor 不提供独立 TUI，不提供网页编辑器，不替代 VSCode、Obsidian、Typora、Neovim、Zed 等文本编辑工具。

OpenAthor 的主要用户界面是 Pi Agent CLI。用户通过自然语言和 Pi Agent 对话，Pi Agent 根据 OpenAthor skill 调用 OpenAthor CLI。

```text
User
  -> Pi Agent CLI
  -> OpenAthor Skill
  -> OpenAthor CLI
  -> OpenAthor Novel Project
```

## 核心判断

写小说的核心体验不是在网页里输入正文，而是在一个长期项目里持续控制内容。

现有文本编辑器已经能很好地处理正文编辑、文件浏览、搜索、版本管理和多窗口工作流。OpenAthor 不应当把早期资源投入到编辑器体验，而应当补足 agent 写长篇小说时最缺的能力：

- 项目结构稳定
- 长期上下文可管理
- 人物、设定、时间线可维护
- 章节生成可控
- 审稿结果可追踪
- 修改以 diff 形式呈现
- 用户永远可以回退或手动编辑

## 目标用户体验

用户的基本使用方式：

```bash
openathor init my-novel
cd my-novel
openathor skill install pi
pi
```

然后用户在 Pi Agent CLI 中直接说：

```text
使用 OpenAthor，帮我创建一本都市悬疑小说。
```

或：

```text
继续写第 3 章，但不要提前揭露父亲的真实身份。
```

或：

```text
检查第 5 章有没有设定冲突和人物动机问题。
```

用户不需要知道 Pi Agent 调用了哪些命令。命令是 agent-facing API，不是主交互界面。

对于已经写了一半的小说，用户不需要重建项目，也不应该被要求改造成 OpenAthor 的标准目录后才能使用。更合理的方式是让 Pi Agent 通过 OpenAthor 接管现有稿件：

```bash
cd existing-novel
openathor adopt --dry-run
openathor skill install pi
pi
```

然后用户在 Pi Agent CLI 中说：

```text
这本小说已经写到第 37 章了，使用 OpenAthor 分析现状，然后帮我继续写第 38 章。
```
