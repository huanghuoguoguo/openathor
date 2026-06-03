# Core Scenarios

## 场景一：从零开始建书

用户说：

```text
使用 OpenAthor，帮我创建一本赛博朋克悬疑小说。
```

Pi Agent 应该：

1. 确认项目是否已初始化
2. 如未初始化，引导调用 `openathor init`
3. 询问必要创作偏好
4. 生成 premise、style、world、characters
5. 生成第一版 outline
6. 让用户确认方向

## 场景二：接管已写一半的小说

用户说：

```text
这本小说已经写到第 37 章了，使用 OpenAthor 接入，然后帮我继续写。
```

Pi Agent 应该：

1. 调用 `openathor adopt --dry-run --json`
2. 展示识别结果：章节数量、文件类型、疑似缺失、顺序问题
3. 询问用户是否按当前识别结果接管
4. 调用 `openathor adopt`
5. 分析已有正文，生成章节摘要、人物列表、已确认设定、待确认设定、时间线和未解决伏笔
6. 把模型推断写入 `bible/canon.pending.md` 或 `notes/import-questions.md`
7. 让用户确认关键设定
8. 生成第 38 章的 continuation context

这个流程的成功标准是：Pi Agent 在继续写第 38 章前，已经知道前 37 章发生了什么、人物当前状态是什么、哪些伏笔不能丢、哪些设定不能改。

## 场景三：继续写下一章

用户说：

```text
继续写第 7 章，重点加强女主的不信任感。
```

Pi Agent 应该：

1. 调用 `openathor context chapter 7 --json`
2. 检查第 7 章是否已有草稿
3. 基于章纲、上章摘要、相关人物、伏笔和风格要求生成草稿
4. 以 diff 或新文件形式输出
5. 记录运行信息

## 场景四：审稿

用户说：

```text
检查第 5 章有没有人物动机问题。
```

Pi Agent 应该：

1. 调用 `openathor context chapter 5 --json`
2. 读取第 5 章正文
3. 从人物动机、设定一致性、节奏、伏笔推进角度审查
4. 将结果写入 `reviews/chapter-005.md`
5. 给用户简短列出高优先级问题

## 场景五：局部改稿

用户说：

```text
把第 3 章开头改得更冷静克制，不要增加新剧情。
```

Pi Agent 应该：

1. 读取第 3 章
2. 明确改稿目标和限制
3. 只修改相关段落
4. 输出 diff
5. 不改变后续剧情事实

## 场景六：同步设定

用户说：

```text
把最近几章新增的重要设定同步到 canon。
```

Pi Agent 应该：

1. 调用 `openathor canon sync --diff`
2. 提取新增事实
3. 区分已确认 canon 和待确认推断
4. 让用户确认后写入 `bible/canon.md`

## 场景七：插入一章

用户说：

```text
在第 12 章和第 13 章之间插入一章，让男主第一次怀疑老师。
```

Pi Agent 应该：

1. 调用 `openathor outline insert --after ch_00012 --diff`
2. 创建新的稳定章节 ID
3. 调整章节展示顺序，但不破坏已有章节引用
4. 生成新章节目标和场景卡
5. 检查第 13 章及之后章节是否需要上下文刷新
6. 让用户确认大纲 diff 后再生成正文

## 场景八：删除或归档章节

用户说：

```text
删除第 8 章，但保留里面关于母亲项链的设定。
```

Pi Agent 应该：

1. 调用 `openathor outline impact ch_00008 --json`
2. 列出第 8 章包含的 canon、伏笔、人物状态和后续引用
3. 默认建议归档章节，而不是物理删除文件
4. 调用 `openathor outline archive ch_00008 --keep-facts --diff`
5. 把需要保留的事实转入 canon 或 pending canon
6. 让用户确认后续章节是否需要重规划

## 尚需补齐的真实场景

这些场景不一定全部进入第一版，但必须在设计时提前留口：

- 用户只有一堆散稿、灵感、设定和废稿混在一起
- 用户想局部改稿，但没有编辑器 selection 能力
- 用户从第 20 章开始重规划后续剧情，前文事实不动
- 用户想试两个剧情方向，但不想覆盖主线
- 小说已经很长，需要长期上下文压缩和相关性检索
- 用户手写内容和 agent 准备修改的文件发生冲突
- 用户希望导入 `.txt`、`.md`、`.docx` 或其他写作工具导出的内容
