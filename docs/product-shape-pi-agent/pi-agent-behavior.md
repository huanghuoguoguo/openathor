# Pi Agent Behavior

OpenAthor Pi Skill 应该要求 Pi Agent 遵守以下行为。

## Skill 加载方式

- `openathor skill install pi` 默认安装项目级 skill 到 `.pi/skills/openathor/SKILL.md`
- 可选全局安装到 `~/.pi/agent/skills/openathor/SKILL.md`
- Slice 1 已实现该安装命令；项目级安装已纳入 fixture 回归
- Pi runtime spike 显示显式 `--skill <path>` 加载可靠，不能依赖模型只凭 skill 名称猜测临时 skill
- 在 OpenAthor 项目中启动 Pi 时，应优先使用项目级 skill
- 如果 skill 未被发现，Pi Agent 应提示用户运行 `openathor skill install pi` 或用 `pi --skill .pi/skills/openathor/SKILL.md`

## 使用 sub-agent 时

- sub-agent 是可选增强，不是 OpenAthor 基础能力的前置条件
- 主 Pi Agent 对最终用户回复和文件修改负责
- sub-agent 不应直接写用户正文或 confirmed canon
- sub-agent 输出应作为 findings、draft suggestions 或 review notes
- 高风险操作仍需主 Pi Agent 汇总影响并向用户确认
- run 记录应标明 `agent_role`
- 开发和测试阶段可以用 sub-agent 并行生成 findings、patch suggestions 和 judge reports，但最终合并前仍必须通过 deterministic checks

## 接管已有稿件时

- 先调用 `openathor adopt --dry-run --json`，不要直接改用户文件
- 向用户说明识别到了哪些章节、哪些文件无法判断
- 对章节顺序、标题、缺失章节和重复章节进行确认
- 对提取出的 canon 使用待确认状态
- 不把模型推断当成已确认事实
- 不重写已有正文作为接管的一部分
- 接管完成后再进入续写、审稿或改稿流程

## 写作前

- 先确认当前目录是否是 OpenAthor 项目
- 读取 `openathor.yaml`
- 根据任务调用 `openathor context`
- 不要凭空忽略 bible、outline 和 canon
- 如果用户目标和现有 canon 冲突，先指出冲突

## 写作中

- 长篇正文生成应按章节或场景进行
- 优先生成可审阅 diff
- 不直接重写整本书
- 不擅自改变核心设定
- 不擅自删除用户手写内容
- 遇到大剧情分歧时先问用户

## 写作后

- 输出本次变更摘要
- 提醒用户检查 diff
- 对新增设定调用或建议调用 `openathor canon sync`
- 对章节更新摘要、人物状态和伏笔状态
- 把运行记录保存到 `runs/`
