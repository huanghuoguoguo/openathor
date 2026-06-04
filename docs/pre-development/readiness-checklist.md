# Readiness Checklist

在以下事项没有完成前，不进入产品代码实现。

## 产品定义

- [ ] 明确第一阶段只支持 Pi Agent
- [ ] 明确不做自研 TUI
- [ ] 明确不做网页编辑器
- [ ] 明确用户继续使用外部文本编辑器
- [ ] 明确 CLI 是 agent-facing 工具层

## 用户故事

- [ ] 从零创建新小说项目
- [ ] 接管已经写了一半的小说
- [ ] 从散稿目录识别正文、设定、灵感和废稿
- [ ] 继续写下一章
- [ ] 审查已有章节
- [ ] 局部改稿
- [ ] 同步新增设定到 canon
- [ ] 从中途重规划后续剧情
- [ ] 插入章节
- [ ] 删除或归档章节
- [ ] 移动章节
- [ ] 拆分或合并章节

## 项目协议

- [ ] 定义 `openathor.yaml`
- [ ] 定义 `bible/`
- [ ] 定义 `outline/`
- [ ] 定义 volume、chapter、scene 的稳定 ID
- [ ] 定义章节 display order 和内部 ID 的关系
- [ ] 定义故事资产引用关系
- [ ] 定义 `manuscript/`
- [ ] 定义 `notes/`
- [ ] 定义 `reviews/`
- [ ] 定义 `runs/`
- [ ] 定义 `.openathor/manuscript.index.yaml`
- [ ] 定义 `.openathor/index.sqlite` 的派生索引边界
- [ ] 定义 `.openathor/vector/` 的可选检索索引边界
- [ ] 定义 confirmed、pending、question 三类 canon 状态
- [ ] 定义明文文件是唯一事实源

## CLI 合约

- [ ] 定义 `openathor init`
- [ ] 定义 `openathor adopt --dry-run`
- [ ] 定义 `openathor adopt`
- [ ] 定义 `openathor doctor`
- [ ] 定义 `openathor index rebuild`
- [ ] 定义 `openathor search text`
- [ ] 定义 `openathor search related`
- [ ] 定义 `openathor context`
- [ ] 定义 `openathor outline show`
- [ ] 定义 `openathor outline insert`
- [ ] 定义 `openathor outline move`
- [ ] 定义 `openathor outline archive`
- [ ] 定义 `openathor outline impact`
- [ ] 定义 `openathor outline replan`
- [ ] 定义 `openathor plan`
- [ ] 定义 `openathor draft`
- [ ] 定义 `openathor review`
- [ ] 定义 `openathor revise`
- [ ] 定义 `openathor canon sync`
- [ ] 定义 `openathor export --format markdown`
- [ ] 定义 JSON 输出格式
- [ ] 定义 diff 输出格式
- [ ] 定义错误码和错误消息原则

## Pi Skill

- [ ] 定义 Pi Skill 安装位置
- [ ] 定义 Pi Skill 文件格式
- [ ] 定义 Pi Agent 识别项目的方式
- [ ] 定义 Pi Agent 写作前上下文读取顺序
- [ ] 定义 Pi Agent 何时必须询问用户
- [ ] 定义 Pi Agent 如何处理用户手写内容
- [ ] 定义 sub-agent 是可选增强而非 MVP 依赖
- [ ] 定义预留 sub-agent 角色
- [ ] 定义 run 记录中的 `agent_role`

## 验收和测试

- [ ] 准备新建项目验收样例
- [ ] 准备 3 章已有小说接管样例
- [ ] 准备 30 章长篇接管样例
- [ ] 准备散稿目录样例
- [ ] 准备局部改稿样例
- [ ] 准备 canon 冲突样例
- [ ] 定义每个样例的期望输出
- [ ] 定义 deterministic checks
- [ ] 定义 LLM judge 输入格式
- [ ] 定义 judge rubric
- [ ] 定义 blocking failure 标准
- [ ] 定义最小回归场景集
- [ ] 定义完整 MVP 场景集

## 迭代管理

- [ ] 每次产品决策有记录
- [ ] 每个开放问题有 owner 或下一步
- [ ] 每个实现任务能追溯到用户故事
- [ ] 每个 MVP 范围变更都同步更新文档路由
- [ ] GitHub issue -> PR -> CI -> squash merge 流程已启用
- [ ] `main` 分支保护已启用
