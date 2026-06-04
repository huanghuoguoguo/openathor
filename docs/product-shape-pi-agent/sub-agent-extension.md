# Sub-agent Extension

## 产品判断

Pi sub-agent 应作为可选增强层预留，不作为基础能力硬依赖。

OpenAthor 的底层能力必须先由 Project Protocol、Pi Skill 和 CLI 保证。sub-agent 只能增强并行处理、审稿分工、长篇接管和评估流程，不能成为用户完成基础写作任务的前置条件。

## 为什么要预留

长篇小说工作流天然适合多角色协作：

- 有人负责总结前文
- 有人负责检查 canon
- 有人负责审稿
- 有人负责规划大纲
- 有人负责评估变更风险

如果 Pi 运行环境支持 sub-agent，OpenAthor 可以把这些工作拆给专门角色，提升质量和速度。

## 不作为基础依赖

核心产品闭环必须在没有 sub-agent 的情况下成立：

```text
User
  -> Pi Agent
  -> OpenAthor Skill
  -> OpenAthor CLI
  -> Novel Project
```

可选增强形态：

```text
User
  -> Pi Agent
  -> OpenAthor Skill
  -> OpenAthor CLI
  -> optional sub-agents
  -> Novel Project
```

如果用户没有安装 Pi sub-agent 扩展，OpenAthor 仍然要可用。

## 建议预留角色

后续可以提供：

```text
.pi/agents/
  openathor-context-scout.md
  openathor-continuity-reviewer.md
  openathor-outline-planner.md
  openathor-style-editor.md
  openathor-qa-judge.md
```

### context-scout

负责在长篇项目中查找相关章节、场景、人物和伏笔。

### continuity-reviewer

负责检查 canon、人物状态、时间线和前后文冲突。

### outline-planner

负责插章、删章、移动章节、重规划后续剧情时提出结构方案。

### style-editor

负责局部改稿、语气控制、节奏调整和风格一致性。

### qa-judge

负责根据评估 rubric 检查 agent 行为和输出质量。

## 适合 sub-agent 的场景

- 接管 30 章以上已有小说
- 并行总结多个章节
- 删除或移动章节前做影响分析
- 重规划后续剧情
- canon 冲突审查
- LLM-as-judge 评估
- 发版前跑完整目标场景集

## 不适合 sub-agent 的场景

- 初始化项目
- 普通续写下一章
- 简单局部改稿
- 导出 Markdown
- `doctor`
- `index rebuild`
- 其他确定性 CLI 任务

## 对 CLI 的要求

为了支持 sub-agent，CLI 输出必须适合被多个 agent 使用：

- 所有 agent-facing 命令支持 `--json`
- 高风险命令支持 `--dry-run` 和 `--diff`
- 输出中带 stable ID
- 输出中标明 source files
- 输出中区分 confirmed、pending、question
- run 记录中保留 agent role

示例：

```json
{
  "run_id": "run_20260604_001",
  "agent_role": "continuity-reviewer",
  "task": "outline_impact",
  "sources": ["outline/chapters.yaml", "bible/canon.md"],
  "findings": []
}
```

## 对评估体系的要求

评估体系应允许单 agent 和多 sub-agent 两种执行模式。

同一个场景可以记录：

- operator mode：single-agent 或 sub-agent
- 使用了哪些 agent role
- 每个 role 的输入和输出
- 最终由主 Pi Agent 做了哪些决策

Judge 只评价最终行为和证据，不因为使用或未使用 sub-agent 而加分。

## 产品边界

第一阶段只预留：

- sub-agent 角色定义
- run 记录中的 `agent_role`
- CLI JSON 输出可被多个 agent 消费
- 评估体系能记录 sub-agent 模式

不在首个实现切片中要求：

- 自动安装 Pi sub-agent 扩展
- 强制创建 `.pi/agents/`
- 复杂多 agent 调度器
- 跨 agent 长期记忆同步
