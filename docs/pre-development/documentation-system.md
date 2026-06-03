# Documentation System

## 组织规则

每个重要主题使用一个顶层路由文档和一个同名子目录。

```text
docs/
  product-shape-pi-agent.md
  product-shape-pi-agent/
    overview.md
    user-workflows.md
    components.md
  pre-development.md
  pre-development/
    readiness-checklist.md
    codex-workflow.md
```

顶层文档只做三件事：

- 说明主题目标
- 给出阅读顺序
- 链接到子文档

详细内容放在同名子目录。

## 修改规则

- 新增主题时，先创建 `docs/<topic>.md`
- 复杂主题必须创建 `docs/<topic>/`
- 修改子文档时，同步检查顶层路由是否需要更新
- 不把所有内容堆进单个 Markdown 文件
- 不在多个文件重复维护同一段长内容

## 文档质量要求

- 每个文档有清晰标题
- 每个文档只承担一个职责
- 决策和开放问题分开
- 当前结论和待评估问题分开
- MVP 范围和后续扩展分开
- 产品行为和技术实现分开

## 进入实现前的要求

实现前至少应有：

- 产品形态文档
- 前期准备文档
- 项目协议文档
- CLI 合约文档
- Pi Skill 行为文档
- MVP 验收文档
