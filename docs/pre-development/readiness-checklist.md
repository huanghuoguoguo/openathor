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

## 项目协议

- [ ] 定义 `openathor.yaml`
- [ ] 定义 `bible/`
- [ ] 定义 `outline/`
- [ ] 定义 `manuscript/`
- [ ] 定义 `notes/`
- [ ] 定义 `reviews/`
- [ ] 定义 `runs/`
- [ ] 定义 `.openathor/manuscript.index.yaml`
- [ ] 定义 confirmed、pending、question 三类 canon 状态

## CLI 合约

- [ ] 定义 `openathor init`
- [ ] 定义 `openathor adopt --dry-run`
- [ ] 定义 `openathor adopt`
- [ ] 定义 `openathor doctor`
- [ ] 定义 `openathor context`
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

## 验收和测试

- [ ] 准备新建项目验收样例
- [ ] 准备 3 章已有小说接管样例
- [ ] 准备 30 章长篇接管样例
- [ ] 准备散稿目录样例
- [ ] 准备局部改稿样例
- [ ] 准备 canon 冲突样例
- [ ] 定义每个样例的期望输出

## 迭代管理

- [ ] 每次产品决策有记录
- [ ] 每个开放问题有 owner 或下一步
- [ ] 每个实现任务能追溯到用户故事
- [ ] 每个 MVP 范围变更都同步更新文档路由
