# OpenAthor 前期准备

本文档是前期准备工作的路由页。详细内容拆分在 `docs/pre-development/` 下。

## 目标

在写第一行产品代码前，先完成产品形态、项目协议、CLI 合约、Pi Skill 行为、验收场景和防偏移规则。OpenAthor 的早期风险不在“能不能写出命令”，而在“命令写出来后是否真的支撑小说创作闭环”，以及实现是否偏离目标架构。

## 阅读顺序

1. [Readiness Checklist](pre-development/readiness-checklist.md)：进入开发前必须完成的事项
2. [Documentation System](pre-development/documentation-system.md)：文档组织和维护规则
3. [Codex Workflow](pre-development/codex-workflow.md)：用 Codex 推进项目的工作方式
4. [Skill Plan](pre-development/skill-plan.md)：当前项目需要的本地 Codex skills
5. [Target Validation](pre-development/target-validation.md)：目标产品形态的验收方式
6. [Project Protocol](project-protocol.md)：项目协议
7. [CLI Contract](cli-contract.md)：CLI 合约
8. [Decisions](decisions.md)：产品和架构决策
9. [LLM-as-Judge Evaluation](llm-as-judge.md)：agent QA、场景回归和 judge 评分体系

## 当前开发闸门

当前阶段不写产品代码。只有当以下内容完成并被确认后，才进入实现：

- 产品形态
- 目标用户故事
- OpenAthor 项目协议
- CLI 命令合约
- Pi Skill 行为规范
- 接管已有小说流程
- 验收样例和测试夹具策略
- LLM-as-judge 评估体系
- 产品和架构决策记录方式
- 实现切片和防偏移规则

## 推荐下一步

先完成 Slice 0 的产品、协议、CLI、验证和决策冻结，再基于这些文档拆出实现任务。
