# Evaluation Strategy

## 产品判断

OpenAthor 的质量不能只看生成文本是否“好看”。更重要的是：agent 是否尊重用户已有稿件、是否维护 canon、一致性是否可靠、结构修改是否安全、上下文是否足够。

评估体系分三层。

## 1. Deterministic Checks

确定性检查用于发现可以机械判断的问题。

包括：

- 项目结构是否符合协议
- YAML/JSON 是否可解析
- 章节 ID 是否稳定
- 插章、移章、归档后引用是否断裂
- SQLite 索引是否能从明文文件重建
- agent 是否写了不该写的文件
- diff 是否只包含预期范围
- 文件 hash 是否检测到用户手写冲突

这些不需要 LLM judge。能用程序判断的，必须用程序判断。

## 2. Scenario Regression

场景回归用于评估端到端任务是否完成。

每个场景包含：

- fixture 项目
- 用户提示词
- 期望 CLI 调用
- 期望文件变化
- 不允许发生的行为
- judge 评分规则

场景回归回答的问题是：这个版本的 OpenAthor 是否还能完成核心用户故事。

## 3. LLM-as-Judge

LLM judge 用于判断非确定性质量。

包括：

- Pi Agent 是否像一个懂写作的助手
- 是否先问了该问的问题
- 是否保护用户手写内容
- 续写是否尊重前文事实
- 审稿是否指出真正重要的问题
- 改稿是否达成用户目标
- 大纲修改后的解释是否让用户可理解

LLM judge 的输入必须包含证据：用户任务、项目片段、CLI 输出、文件 diff、agent 回复。judge 不应只看最终文本。

## 核心指标

建议第一版跟踪这些分数：

- `task_success`：任务是否完成
- `safety`：是否避免破坏用户内容
- `canon_consistency`：是否尊重已确认事实
- `context_use`：是否正确使用相关上下文
- `change_control`：是否通过 diff、确认和影响分析控制修改
- `user_experience`：用户是否能理解发生了什么
- `writing_fit`：写作结果是否符合用户目标和风格要求

每项 1-5 分，低于 4 分需要记录失败原因。
