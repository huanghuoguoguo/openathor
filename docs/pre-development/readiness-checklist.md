# Readiness Checklist

在以下事项没有完成前，不进入产品代码实现。

这个 checklist 不是为了把产品压成临时最小版本，而是为了确保实现开始时不会发生产品需求偏移、架构偏移，或为了局部命令写出未来要推倒的数据模型。

## 完成标准

一个准备项只有同时满足以下条件，才算完成：

- 有明确 owning document
- 有当前结论
- 有尚未解决问题的记录
- 有对应验证方式
- 不与已记录的产品和架构决策冲突

## 已锁定的产品和架构决策

- [x] 当前产品轨道是 Pi Agent first
- [x] 不做自研 TUI
- [x] 不做网页编辑器
- [x] 用户继续使用外部文本编辑器
- [x] CLI 是 agent-facing 工具层
- [x] Project Protocol 是核心产品资产
- [x] 明文文件是唯一事实源
- [x] SQLite 和向量索引都是派生数据
- [x] Skill 轻逻辑，CLI 做确定性操作
- [x] 接管已有小说默认非侵入式
- [x] 实现按目标形态切片，不写临时局部架构

参考：

- [Product Shape](../product-shape-pi-agent.md)
- [Project Protocol](../project-protocol.md)
- [CLI Contract](../cli-contract.md)
- [Decisions](../decisions.md)

## 目标用户故事

- [x] 从零创建新小说项目
- [x] 接管已经写了一半的小说
- [x] 从散稿目录识别正文、设定、灵感和废稿
- [x] 继续写下一章
- [x] 审查已有章节
- [x] 局部改稿
- [x] 同步新增设定到 canon
- [x] 从中途重规划后续剧情
- [x] 插入章节
- [x] 删除或归档章节
- [x] 移动章节
- [x] 拆分或合并章节

参考：[Core Scenarios](../product-shape-pi-agent/core-scenarios.md)

## 项目协议

- [x] 定义 `openathor.yaml`
- [x] 定义 `bible/`
- [x] 定义 `outline/`
- [x] 定义 volume、chapter、scene 的稳定 ID
- [x] 定义章节 display order 和内部 ID 的关系
- [x] 定义故事资产引用关系
- [x] 定义 `manuscript/`
- [x] 定义 `notes/`
- [x] 定义 `reviews/`
- [x] 定义 `runs/`
- [x] 定义 `.openathor/manuscript.index.yaml`
- [x] 定义 `.openathor/index.sqlite` 的派生索引边界
- [x] 定义 `.openathor/vector/` 的可选检索索引边界
- [x] 定义 confirmed、pending、question 三类 canon 状态
- [x] 定义明文文件是唯一事实源
- [ ] 补充协议 schema 示例和 fixtures

参考：[Project Protocol](../project-protocol.md)

## CLI 合约

- [x] 定义目标命令面
- [x] 定义实现切片顺序
- [x] 定义 JSON 输出格式
- [x] 定义 diff 输出格式
- [x] 定义写入安全等级
- [x] 定义错误码和错误消息原则
- [ ] 补充每个命令的参数 schema
- [ ] 补充每个命令的 expected writes
- [ ] 补充每个命令的 fixture contract

参考：[CLI Contract](../cli-contract.md)

## Pi Skill

- [ ] 定义 Pi Skill 安装位置
- [ ] 定义 Pi Skill 文件格式
- [x] 定义 Pi Agent 识别项目的方式
- [x] 定义 Pi Agent 写作前上下文读取顺序
- [x] 定义 Pi Agent 何时必须询问用户
- [x] 定义 Pi Agent 如何处理用户手写内容
- [x] 定义 sub-agent 是可选增强而非基础依赖
- [x] 定义预留 sub-agent 角色
- [x] 定义 run 记录中的 `agent_role`
- [ ] 完成 Pi Agent runtime spike：确认 skill、CLI 调用、JSON 读取和 diff 确认流程可行

参考：

- [Pi Agent Behavior](../product-shape-pi-agent/pi-agent-behavior.md)
- [Sub-agent Extension](../product-shape-pi-agent/sub-agent-extension.md)

## 验收和测试

- [x] 定义新建项目验收样例
- [x] 定义 3 章已有小说接管样例
- [x] 定义 30 章长篇接管样例
- [x] 定义散稿目录样例
- [x] 定义局部改稿样例
- [x] 定义 canon 冲突样例
- [x] 定义结构变更样例
- [x] 定义长篇检索样例
- [x] 定义 blocking failure 标准
- [x] 定义 deterministic checks
- [x] 定义 LLM judge 输入格式
- [x] 定义 judge rubric
- [ ] 落地 fixture 目录和 expected 输出
- [ ] 定义自动化 deterministic check 脚本入口

参考：

- [Target Validation](target-validation.md)
- [LLM-as-Judge Evaluation](../llm-as-judge.md)

## 迭代管理

- [x] 每次产品决策有记录位置
- [x] 每个实现任务能追溯到用户故事、协议、CLI 合约和验证
- [x] 产品和架构防偏移规则已定义
- [x] 实现切片规则已定义
- [ ] 每个开放问题有 owner 或下一步
- [ ] GitHub issue -> PR -> CI -> squash merge 流程已启用
- [ ] `main` 分支保护已启用

参考：[Decisions](../decisions.md)
