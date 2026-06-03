# Pi Agent Behavior

OpenAthor Pi Skill 应该要求 Pi Agent 遵守以下行为。

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
