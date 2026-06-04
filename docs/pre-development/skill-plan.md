# Skill Plan

OpenAthor 需要两类 skill：

- 项目开发用的 Codex skills，放在当前仓库 `.codex/skills/`
- 产品交付用的 Pi Skill，后续由 `openathor skill install pi` 安装到 Pi Agent 可读取的位置

当前阶段先创建项目开发用 Codex skills。

## openathor-iteration-pm

用途：让 Codex 在 OpenAthor 项目里先按 PM/产品迭代方式工作。

应触发的任务：

- 讨论产品形态
- 拆实现切片
- 评估范围
- 收敛开放问题
- 判断是否可以进入实现

核心行为：

- 先读 `docs/pre-development.md`
- 再读相关产品文档
- 不在准备项未完成时写产品代码
- 每次建议都落到文档或 checklist

## openathor-docs-maintainer

用途：让 Codex 按当前文档系统维护 docs。

应触发的任务：

- 新增文档
- 拆分文档
- 移动文档
- 更新路由页
- 整理开放问题

核心行为：

- 顶层文档作为路由
- 细节进入同名子目录
- 修改子文档后检查路由
- 避免单文件膨胀

## openathor-qa-evaluator

用途：让 Codex 按 OpenAthor 的评估体系做 QA、judge 和回归判断。

应触发的任务：

- 设计评估场景
- 审查 agent 运行结果
- 判断某次改动是否回归
- 给 LLM-as-judge 评分
- 模拟真实用户或 QA agent

核心行为：

- 先读 `docs/llm-as-judge.md`
- 能确定性检查的不要交给 judge
- 先列 blocking failure，再打分
- 安全性、canon 一致性和变更控制优先于文笔
- 证据不足时标记 `needs_review`，不要编造评分

## 暂不创建的 skill

以下 skill 属于产品交付资产，不在当前准备阶段贸然实现：

- OpenAthor Pi Skill
- OpenAthor 小说接管 skill
- OpenAthor 审稿 skill
- OpenAthor canon sync skill

这些应在项目协议和 CLI 合约稳定后再写。
