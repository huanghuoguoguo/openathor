# CI Policy

## 当前阶段

当前仓库处于 Slice 2/3/4 能力并行补齐阶段。CI 覆盖文档仓库基础健康检查、TypeScript tooling 类型检查、schema 校验、构建、Slice 1/2/3/4 fixture 回归，以及 LLM-as-judge smoke。

## 必须通过的检查

当前 CI jobs：

```text
docs
tooling
```

检查内容：

- `README.md` 存在
- `AGENTS.md` 存在
- `docs/index.md` 存在
- Markdown 文件不能为空
- 重要顶层文档有同名子目录
- `project-protocol`、`cli-contract`、`decisions` 等核心 route 有同名子目录

`tooling` 检查内容：

- `npm ci`
- `npm test`

`npm test` 覆盖：

- TypeScript 类型检查
- schema 编译校验
- CLI 构建
- Slice 1/2/3/4 fixture 回归
- `openathor doctor --json --strict` fixture gate
- `openathor-judge-smoke` evidence package 结构校验

## 后续扩展

后续产品切片应逐步增加：

- formatting
- lint
- unit tests
- deterministic checks
- 真实 Pi Agent transcript 回归
- LLM judge scores 门禁

## 原则

CI 先验证确定性问题。LLM judge 不能替代 schema、diff、索引和测试检查。
