# OpenAthor Docs

这是 OpenAthor 文档入口。

## 当前阶段

当前阶段是 Slice 1 协议内核。项目已具备 TypeScript/Node.js CLI、协议 schema、fixture 回归和 deterministic check 入口。

当前可用范围是创建项目、非侵入式接管已有小说、检查项目协议、重建派生索引。正文生成、写作闭环、Pi Skill 安装和 LLM-as-judge 自动评测仍属于后续切片。

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
