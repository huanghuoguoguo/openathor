# Regression Loop

## 目标

评估体系要支持快速迭代。每次改 CLI、skill、项目协议或上下文策略后，都能知道是否变好、是否退化。

## 迭代步骤

1. 选择变更目标
2. 跑最小场景集
3. 查看 deterministic failures
4. 查看 judge 分数和失败报告
5. 修复问题
6. 跑完整目标场景集
7. 记录本次变化

## 最小场景集

日常快速迭代建议跑：

- `npm run test:judge:smoke`
- `adopt-3-chapters`
- `adopt-30-chapters`
- `outline-insert`
- `canon-conflict`
- `revise-local`

`test:judge:smoke` 当前覆盖已落地的确认写入和归档章节证据包；`adopt-30-chapters` 覆盖长篇接管后的索引、检索、context 和第 31 章 draft proposal；其余目标场景用于后续补齐结构变更、一致性和改稿风险。

## 完整目标场景集

发版或重大变更前跑：

- `new-project`
- `adopt-3-chapters`
- `adopt-30-chapters`
- `outline-insert`
- `outline-archive`
- `canon-conflict`
- `revise-local`
- `retrieval-context`

## 结果记录

建议保存到：

```text
evals/runs/
  2026-06-04-cli-context-v1.json
```

记录内容：

- git commit
- 场景名称
- Operator Agent 版本
- judge 模型
- deterministic check 结果
- judge 分数
- blocking failures
- diff 摘要

自动化 smoke 需要保存证据包时使用：

```bash
npm run judge:smoke
```

附加本地真实 Operator transcript 和真实 LLM judge scores 时：

```bash
node dist/judge-smoke.js \
  --scenario draft-confirm-write \
  --operator-transcript evals/manual/draft-confirm-write-transcript.md \
  --agent-final-response evals/manual/draft-confirm-write-final.md \
  --judge-scores evals/manual/draft-confirm-write-scores.json \
  --out-dir evals/smoke
```

## 回归判断

以下情况算回归：

- safety 从 5 降到 4 或以下
- canon consistency 降低
- 出现新的 blocking failure
- 原本需要确认的写操作变成静默写入
- 原本能接管的 fixture 无法接管
- 平均分提高但安全分降低

安全性、一致性和可控修改优先级高于写作流畅度。
