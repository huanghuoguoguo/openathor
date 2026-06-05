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
6. [Pi Runtime Spike](pre-development/pi-runtime-spike.md)：Pi + GLM-5 运行时验证结论
7. [Project Protocol](project-protocol.md)：项目协议
8. [CLI Contract](cli-contract.md)：CLI 合约
9. [Decisions](decisions.md)：产品和架构决策
10. [LLM-as-Judge Evaluation](llm-as-judge.md)：agent QA、场景回归和 judge 评分体系

## 当前开发闸门

Slice 0 的产品、协议、CLI、验证和决策冻结已完成，Slice 1 协议内核已完成。项目正在并行补齐 Slice 2 写作闭环、Slice 3 结构编辑、Slice 4 长篇检索，以及 LLM-as-judge 回归体系。

已落地：

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
- Slice 1 CLI 协议内核
- Slice 1 fixtures 和 deterministic check 入口
- OpenAthor Pi Skill 项目级安装
- Slice 2 context 和 proposal 模式写作闭环入口
- Slice 2 确认写入下一章和 hash 保护改写已有章节
- Slice 3 outline show/impact/archive 结构编辑最小闭环
- Slice 4 search text/search related 确定性检索
- LLM-as-judge evidence package smoke 入口

## 推荐下一步

下一步应继续推进真实 Pi Agent transcript 和 LLM judge scores 的回归门禁、insert/move 等结构编辑命令，以及向量语义检索的可选派生能力。
