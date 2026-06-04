# Product And Architecture Guardrails

## 目标

这些规则用于防止产品需求偏移和架构偏移。后续实现速度可以快，但不能为了局部命令牺牲协议、CLI 合约和用户信任边界。

## 产品防偏移

当前产品轨道固定为：

```text
用户自选文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + OpenAthor Project Protocol
```

默认不进入：

- 自研 TUI
- Web 编辑器
- 编辑器插件
- 云协作
- 多 agent 适配
- 发布平台
- 模板市场

这些不是永远不做，而是不能抢占当前产品轨道。

## 架构防偏移

禁止为了局部功能引入以下做法：

- 把 SQLite 或向量索引变成事实源
- 让正文只存在数据库里
- 让 agent 直接维护 `.openathor/index.sqlite`
- 用文件名或章节编号作为内部引用
- 绕过 `openathor.yaml` 推断项目状态
- 在 skill 中堆复杂业务逻辑
- 静默覆盖用户正文或 confirmed canon
- 为单个命令创建无法扩展的一次性文件格式

## 实现任务准入

开始实现某个任务前，应能回答：

- 对应哪个用户场景？
- 依赖哪个 project protocol 文档？
- 依赖哪个 CLI contract 文档？
- 会读哪些事实源文件？
- 会写哪些事实源或派生文件？
- 是否需要 dry-run、diff 或用户确认？
- 有哪个 fixture 或 scenario 验证？
- 是否会影响已有决策？

如果回答不清楚，先补文档，不写代码。

## Drift 信号

出现以下情况说明可能已经偏移：

- 一个功能无法映射到现有用户场景
- 一个命令输出无法放进统一 JSON envelope
- 一个写操作无法说明 source files 和 writes
- 一个数据结构只能服务当前命令
- 一个实现绕过 stable ID 或 display order 规则
- 一个快捷方案要求以后迁移用户正文
- 一个需求让 OpenAthor 变成编辑器或发布平台

## 审查原则

代码 review 时，架构一致性和写入安全优先于局部功能完成度。

如果一个变更能跑通 demo，但引入长期协议债务，应退回产品/协议层重新设计。
