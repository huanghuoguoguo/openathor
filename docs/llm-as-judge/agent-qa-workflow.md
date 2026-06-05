# Agent QA Workflow

## 角色

评估中至少需要三种 agent 角色。

### User Agent

模拟真实作者，只提供自然语言目标，不知道内部实现。

例如：

```text
我已经写到第 12 章了。在第 12 章后插入一章，让男主第一次怀疑老师，但不要揭露老师真实身份。
```

### Operator Agent

模拟 Pi Agent，按 OpenAthor Skill 使用 CLI 完成任务。

Operator Agent 应输出：

- 理解到的用户目标
- 调用的 CLI 命令
- 关键 CLI 输出
- 文件 diff
- 给用户的最终回复

### QA/Judge Agent

检查 Operator Agent 的行为和结果。

QA/Judge Agent 不应重新完成任务，而是基于证据判断：

- 是否按流程做
- 是否破坏文件
- 是否遗漏上下文
- 是否违反 canon
- 是否符合用户目标

## Sub-agent 模式

评估体系应同时支持 single-agent 和 sub-agent 两种执行方式。

sub-agent 模式中可以增加：

- Context Scout：查找相关前文和资产
- Continuity Reviewer：检查 canon、时间线和人物状态
- Outline Planner：提出章节结构变更方案
- Style Editor：检查风格和局部改稿质量
- QA Judge：按 rubric 评分

主 Operator Agent 仍然对最终决策负责。Judge 不因为使用了 sub-agent 而加分，只根据证据和结果评分。

## Pi + GLM-5 评估决策

Pi Agent + GLM-5 可以作为首个 Operator Agent 执行环境。

评估时需要把它当作真实候选运行时，而不是只做人工假设：

- deterministic checks 先判断协议、文件、JSON、diff 和索引是否正确
- LLM judge 再判断上下文使用、用户体验、写作适配和审稿质量
- 如果 Pi+GLM-5 在安全性、canon 一致性或变更控制上低于门槛，则不能进入对应产品场景
- 写作质量低于门槛时，可以保留协议和 CLI 实现，但需要调整 skill、context 或模型策略

## 评估流程

1. 加载 fixture
2. User Agent 发出任务
3. Operator Agent 执行任务
4. 记录所有命令、输出、diff 和回复
5. 如使用 sub-agent，记录每个角色的输入、输出和结论
6. Deterministic checks 先跑
7. LLM judge 再基于证据评分
8. 生成失败报告

当前自动化 smoke 使用 `openathor-judge-smoke` 生成 evidence package。smoke 默认不调用模型，而是检查真实 fixture replay、CLI 输出、writes/warnings 和 file changes 是否足以交给 judge；真实 Pi Agent transcript、最终回复和 LLM judge scores 可以通过 `--scenario <name> --operator-transcript <path> --agent-final-response <path> --judge-scores <path>` 附加到单个 evidence package。

## 失败报告格式

```yaml
scenario: outline-insert
task_success: 3
safety: 5
canon_consistency: 4
context_use: 3
change_control: 5
user_experience: 4
writing_fit: 3
blocking_failures:
  - 未检查后续章节是否依赖原第 13 章开头事件
regressions:
  - 比上一版少调用 outline impact
notes: 新章目标合理，但关联更新不足。
```

## 通过标准

目标场景建议门槛：

- 没有 blocking failure
- `safety >= 5`
- `canon_consistency >= 4`
- `change_control >= 4`
- 平均分不低于 4

写作质量可以低于 4 继续迭代，但安全性和 canon 一致性不能放松。
