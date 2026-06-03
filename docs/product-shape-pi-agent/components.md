# Components

## 1. OpenAthor Project Protocol

这是最核心的资产。它规定一本小说项目在文件系统里如何组织。

建议结构：

```text
openathor.yaml
bible/
  premise.md
  style.md
  world.md
  characters.md
  timeline.md
  canon.md
outline/
  volumes.md
  chapters.yaml
  scenes.yaml
manuscript/
  chapter-001.md
  chapter-002.md
notes/
  hooks.md
  unresolved.md
reviews/
  chapter-001.md
runs/
  2026-06-04-write-chapter-002.json
.openathor/
  manuscript.index.yaml
  index.sqlite
  vector/
```

各目录职责：

- `bible/`：长期设定、人物、风格、时间线、世界观和 canon
- `outline/`：卷纲、章纲、场景结构和章节顺序
- `manuscript/`：正文稿件
- `notes/`：伏笔、待解决问题、用户灵感
- `reviews/`：审稿结果
- `runs/`：agent 每次运行的输入、输出、工具调用和结果摘要
- `.openathor/`：可重建索引、导入报告、缓存和检索数据

章节和场景应使用稳定 ID。章节编号、展示顺序和文件名可以变化，但内部引用不应依赖文件名。

明文文件是唯一事实源。SQLite 和向量索引只作为可删除、可重建的派生数据。

## 2. OpenAthor Pi Skill

Pi Skill 是 Pi Agent 的操作说明书。

它应当定义：

- 什么是 OpenAthor 项目
- 如何识别项目根目录
- 写作前必须读取哪些上下文
- 何时调用 `openathor context`
- 何时调用 `openathor draft`
- 何时调用 `openathor review`
- 何时调用 `openathor canon sync`
- 哪些修改需要用户确认
- 如何避免覆盖用户手写内容
- 如何把输出保存到正确文件

Skill 不应承载复杂业务逻辑。复杂逻辑应由 CLI 提供，skill 只负责任务路由和行为约束。

## 3. OpenAthor CLI

CLI 是 Pi Agent 调用的稳定工具层，同时也允许高级用户直接使用。

CLI 要面向 agent 设计，而不是只面向人类命令行设计。

核心要求：

- 支持 `--json`
- 支持 `--diff`
- 支持 `--dry-run`
- 尽量输出结构化结果
- 错误信息清晰
- 不隐式覆盖用户正文
- 所有写操作尽量记录到 `runs/`

建议命令：

```bash
openathor init
openathor adopt --dry-run
openathor adopt
openathor import
openathor doctor
openathor index rebuild
openathor search text "母亲的项链" --json
openathor search related chapter ch_00031 --json
openathor context chapter 3 --json
openathor outline show --json
openathor outline insert --after ch_00012 --title "裂缝"
openathor outline move ch_00018 --after ch_00012
openathor outline archive ch_00008 --keep-facts
openathor outline replan --from ch_00021 --diff
openathor outline impact ch_00008 --json
openathor plan --diff
openathor draft chapter 3 --diff
openathor review chapter 3 --json
openathor revise chapter 3 --goal "增强悬疑感" --diff
openathor canon sync --diff
openathor export --format markdown
openathor skill install pi
```

## 4. 本地文本编辑器

OpenAthor 默认假设用户会使用外部编辑器。

这不是一个附属选择，而是产品形态的一部分：

- 正文就是 Markdown 文件
- 设定就是 Markdown 或 YAML 文件
- 用户可以随时手改
- 用户可以使用 Git
- 用户可以换编辑器
- 用户不被锁在 OpenAthor UI 里
