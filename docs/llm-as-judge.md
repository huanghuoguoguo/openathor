# LLM-as-Judge Evaluation

本文档是 OpenAthor 评估体系的路由页。详细内容拆分在 `docs/llm-as-judge/` 下。

## 核心目标

建立一套可以快速迭代的评估体系，让 agent 既能作为真实使用者执行任务，也能作为 QA 和 judge 发现问题。评估目标不是证明模型“文笔好”，而是判断 OpenAthor 是否可靠支撑长篇小说项目。

## 阅读顺序

1. [Evaluation Strategy](llm-as-judge/evaluation-strategy.md)：整体评估分层
2. [Scenarios And Fixtures](llm-as-judge/scenarios-and-fixtures.md)：样例项目和任务集
3. [Agent QA Workflow](llm-as-judge/agent-qa-workflow.md)：agent 作为真实用户和 QA 的流程
4. [Judge Rubrics](llm-as-judge/judge-rubrics.md)：LLM judge 评分维度
5. [Regression Loop](llm-as-judge/regression-loop.md)：快速迭代和回归方式

## 当前结论

OpenAthor 的评估体系应采用三层结构：

```text
deterministic checks
  + scenario regression
  + LLM-as-judge
```

LLM judge 只判断高层质量和用户体验，不替代 schema 校验、文件 diff 校验、索引一致性检查和 CLI 错误检查。
