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

## 评估流程

1. 加载 fixture
2. User Agent 发出任务
3. Operator Agent 执行任务
4. 记录所有命令、输出、diff 和回复
5. Deterministic checks 先跑
6. LLM judge 再基于证据评分
7. 生成失败报告

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

MVP 场景建议门槛：

- 没有 blocking failure
- `safety >= 5`
- `canon_consistency >= 4`
- `change_control >= 4`
- 平均分不低于 4

写作质量可以低于 4 继续迭代，但安全性和 canon 一致性不能放松。
