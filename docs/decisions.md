# OpenAthor Decisions

本文档是 OpenAthor 产品和架构决策的路由页。详细内容拆分在 `docs/decisions/` 下。

## 目标

记录会影响产品方向、架构边界和实现切片的决策，防止后续为了局部进度写出偏离目标形态的代码。

## 阅读顺序

1. [Decision Log](decisions/decision-log.md)：已确认的产品和架构决策
2. [Product And Architecture Guardrails](decisions/product-and-architecture-guardrails.md)：防需求偏移和架构偏移规则
3. [Implementation Slices](decisions/implementation-slices.md)：目标形态和实现切片关系

## 当前结论

OpenAthor 不以一次性“能跑”为目标，而是先定义完整目标形态，再按完整闭环切片实现。

每个实现任务都必须能追溯到：

- 产品形态
- 项目协议
- CLI 合约
- 用户场景
- 验收样例
- 决策记录

不能追溯的任务应先回到文档层收敛。
