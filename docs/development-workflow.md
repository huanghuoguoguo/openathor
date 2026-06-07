# Development Workflow

本文档是 OpenAthor 工程协作流程的路由页。详细内容拆分在 `docs/development-workflow/` 下。

## 当前结论

OpenAthor 以 GitHub 为协作事实源。

所有代码和文档变更都应遵循：

```text
issue -> branch -> pull request -> CI -> squash merge -> main
```

`main` 分支受保护。除 bootstrap 仓库设置外，不直接向 `main` 推送变更。

当前交付方法采用 core-first、doc-driven 的长程推进方式。重点不是先堆 demo，而是持续比对文档承诺、实现资产、fixture 回归和 judge evidence，优先补齐核心闭环并控制协议漂移。

## 阅读顺序

1. [GitHub Workflow](development-workflow/github-workflow.md)：Issue、分支、PR、合并规则
2. [CI Policy](development-workflow/ci-policy.md)：当前 CI 要求和后续扩展
3. [Core-First Delivery](development-workflow/core-first-delivery.md)：怎么沉淀资产、核对文档承诺、使用 sub-agent、验证和防跑偏
