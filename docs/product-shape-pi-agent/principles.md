# Principles

## 本地优先

小说项目首先是用户本地文件夹。用户不应因为使用 OpenAthor 而失去对文本的控制权。

## Agent 优先

CLI 的主要调用者是 Pi Agent。命令设计要方便 agent 稳定使用，而不是追求复杂的人类命令行体验。

## Skill 轻逻辑

Skill 负责告诉 Pi Agent 怎么做，CLI 负责真正做。避免把大量业务流程堆在 skill 文档里。

## Diff 优先

所有正文和设定变更都应尽量以 diff 呈现，让用户知道 agent 改了什么。

## Canon 优先

长篇小说最重要的是一致性。任何新增事实、人物状态变化、时间线变化，都应能进入 canon 或待确认列表。

## 不替代编辑器

OpenAthor 不和成熟文本编辑器竞争。它应当成为文本编辑器旁边的 agent-native 小说工作流。

## 前期不写代码

在产品边界、核心用户故事、项目协议、CLI 合约、Pi Skill 行为和验收场景没有完成前，不进入实现。

如果 Codex 被要求开始写代码，应先检查 [Pre-development Readiness](../pre-development.md)，发现未完成项时应提醒用户先补齐前期工作。
