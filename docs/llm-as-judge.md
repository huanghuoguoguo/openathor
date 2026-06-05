# LLM-as-Judge Evaluation

本文档是 OpenAthor 评估体系的路由页。详细内容拆分在 `docs/llm-as-judge/` 下。

## 核心目标

建立一套可以快速迭代的评估体系，让 agent 既能作为真实使用者执行任务，也能作为 QA 和 judge 发现问题。评估目标不是证明模型“文笔好”，而是判断 OpenAthor 是否可靠支撑长篇小说项目。

## 阅读顺序

1. [Evaluation Strategy](llm-as-judge/evaluation-strategy.md)：整体评估分层
2. [Scenarios And Fixtures](llm-as-judge/scenarios-and-fixtures.md)：样例项目和任务集
3. [Agent QA Workflow](llm-as-judge/agent-qa-workflow.md)：agent 作为真实用户和 QA 的流程
4. [Evidence Package](llm-as-judge/evidence-package.md)：judge 证据包格式和自动化 smoke 入口
5. [Judge Rubrics](llm-as-judge/judge-rubrics.md)：LLM judge 评分维度
6. [Regression Loop](llm-as-judge/regression-loop.md)：快速迭代和回归方式

## 当前结论

OpenAthor 的评估体系应采用三层结构：

```text
deterministic checks
  + scenario regression
  + LLM-as-judge
```

LLM judge 只判断高层质量和用户体验，不替代 schema 校验、文件 diff 校验、索引一致性检查和 CLI 错误检查。

当前已落地 `openathor-judge-smoke` 自动化入口。第一版 smoke 生成并校验 judge evidence package，覆盖确认写入正文和归档章节两个场景；本地真实 Pi/Operator Agent transcript、最终回复和真实 LLM judge scores 可以附加到单个 evidence package。真实 Pi 和 judge 模型不进入 CI，只作为本地或手动证据保存。
