# GitHub Workflow

## Source Of Truth

GitHub 是项目协作事实源。

- 需求、缺陷、设计任务先进 issue
- 每次变更从 issue 派生分支
- 所有变更通过 pull request 合入
- `main` 只接受通过 CI 的 squash merge

## Issue

每个变更需要关联 issue。Issue 应说明：

- 背景
- 目标
- 范围
- 验收标准
- 相关文档

## Branch

分支命名建议：

```text
docs/<issue-number>-short-topic
feat/<issue-number>-short-topic
fix/<issue-number>-short-topic
```

## Pull Request

PR 必须包含：

- 关联 issue
- 变更摘要
- 验收方式
- 风险或未决问题
- 文档链接

PR 合并前必须通过 CI。

## Merge

合并策略：

- 使用 squash merge
- 不使用 merge commit
- 不使用 rebase merge
- 合并后删除源分支

Squash commit 信息应简洁，例如：

```text
docs: add development workflow
```

## Main Branch

`main` 分支保护要求：

- Require pull request before merging
- Require status checks before merging
- Require branch to be up to date before merging
- Require conversation resolution before merging
- Restrict direct pushes
