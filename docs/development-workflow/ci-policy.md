# CI Policy

## 当前阶段

当前仓库仍处于前期产品和协议准备阶段，CI 先覆盖文档仓库的基础健康检查。

## 必须通过的检查

当前 CI job：

```text
docs
```

检查内容：

- `README.md` 存在
- `AGENTS.md` 存在
- `docs/index.md` 存在
- Markdown 文件不能为空
- 重要顶层文档有同名子目录

## 后续扩展

进入实现后，CI 应逐步增加：

- formatting
- lint
- unit tests
- CLI contract tests
- fixture regression tests
- deterministic checks
- LLM-as-judge eval smoke tests

## 原则

CI 先验证确定性问题。LLM judge 不能替代 schema、diff、索引和测试检查。
