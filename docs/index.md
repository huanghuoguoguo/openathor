# OpenAthor Docs

这是 OpenAthor 文档入口。

## 当前阶段

当前阶段是前期产品和协议准备，不进入产品代码实现。

## 主要文档

1. [Pre-development](pre-development.md)：开发前准备、文档规则、Codex 工作流、MVP 验收
2. [Product Shape: Pi Agent First](product-shape-pi-agent.md)：Pi Agent 优先的产品形态
3. [LLM-as-Judge Evaluation](llm-as-judge.md)：agent QA、场景回归和 judge 评分体系
4. [Development Workflow](development-workflow.md)：GitHub issue、PR、CI 和 main 分支保护流程

## 文档组织约定

每个重要主题使用一个顶层路由文档和一个同名子目录：

```text
docs/<topic>.md
docs/<topic>/
  child-doc.md
```

顶层文档负责路由和当前结论，详细内容放在子目录。
