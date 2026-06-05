# OpenAthor Docs

这是 OpenAthor 文档入口。

## 当前阶段

当前阶段是 Slice 2/3/4 能力并行补齐。Slice 1 协议内核已完成，项目已具备 TypeScript/Node.js CLI、协议 schema、fixture 回归、deterministic check 入口和 LLM-as-judge smoke 入口。

当前可用范围包括创建项目、非侵入式接管已有小说、检查项目协议、重建派生索引、安装项目级 Pi Skill、生成写作 proposal、确认写入下一章、带 hash 保护改写已有章节、章节归档最小闭环、确定性文本检索、确定性相关检索，以及 LLM-as-judge evidence package smoke。

仍待补齐的是插章、移章、拆分、合并、重规划、向量语义检索，以及真实 Pi Agent transcript 和 LLM judge scores 的本地/手动评估证据保存流程。

## 主要文档

1. [Pre-development](pre-development.md)：开发前准备、文档规则、Codex 工作流和目标验收
2. [Product Shape: Pi Agent First](product-shape-pi-agent.md)：Pi Agent 优先的产品形态
3. [Project Protocol](project-protocol.md)：OpenAthor 小说项目协议
4. [CLI Contract](cli-contract.md)：Pi Agent 调用 OpenAthor 的稳定 CLI 合约
5. [Decisions](decisions.md)：产品、架构和实现切片决策
6. [LLM-as-Judge Evaluation](llm-as-judge.md)：agent QA、场景回归和 judge 评分体系
7. [Development Workflow](development-workflow.md)：GitHub issue、PR、CI 和 main 分支保护流程

## 文档组织约定

每个重要主题使用一个顶层路由文档和一个同名子目录：

```text
docs/<topic>.md
docs/<topic>/
  child-doc.md
```

顶层文档负责路由和当前结论，详细内容放在子目录。
