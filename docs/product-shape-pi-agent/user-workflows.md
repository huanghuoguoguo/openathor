# User Workflows

## 1. 创建新项目

用户通过 OpenAthor 创建一个本地小说项目。

```bash
openathor init my-novel
```

生成：

```text
my-novel/
  openathor.yaml
  bible/
  outline/
  manuscript/
  notes/
  reviews/
  runs/
```

## 2. 接管已有小说

对于已经写了一部分的小说，OpenAthor 提供 `adopt` 工作流。

```bash
cd existing-novel
openathor adopt --dry-run
openathor adopt
```

`adopt` 的目标不是重写、清洗或强制迁移用户稿件，而是让 OpenAthor 能理解这个已有项目。

接管过程应当默认非侵入式：

- 先扫描，不修改正文
- 识别章节文件和章节顺序
- 建立稿件索引
- 生成 OpenAthor 元数据
- 分析已有内容
- 提取人物、设定、时间线和伏笔
- 把不确定内容放入待确认区
- 让用户确认后再写入 canon

接管后可以形成：

```text
existing-novel/
  openathor.yaml
  .openathor/
    manuscript.index.yaml
    import-report.md
  bible/
    canon.md
    canon.pending.md
    characters.md
    style.md
    timeline.md
  outline/
    chapters.yaml
  notes/
    import-questions.md
    unresolved.md
  reviews/
  runs/
```

如果用户原本已有自己的目录结构，OpenAthor 不应强制移动文件。`manuscript.index.yaml` 可以把 OpenAthor 章节 ID 映射到原始文件路径：

```yaml
chapters:
  - id: chapter-001
    title: 雨夜
    source_path: 正文/001-雨夜.md
    status: existing
  - id: chapter-002
    title: 旧案
    source_path: 正文/002-旧案.md
    status: existing
```

只有在用户明确选择标准化时，才提供复制或整理到 `manuscript/` 的能力。

## 3. 安装 Pi Skill

用户安装 OpenAthor 针对 Pi Agent 的 skill。

```bash
openathor skill install pi
```

默认安装位置：

```text
.pi/skills/openathor/SKILL.md
```

可选全局安装位置：

```text
~/.pi/agent/skills/openathor/SKILL.md
```

项目级安装优先，因为它能随小说项目一起被 Pi 发现，也能让不同小说项目使用不同版本的 OpenAthor skill。

如果 Pi 没有自动发现项目级 skill，用户可以显式启动：

```bash
pi --skill .pi/skills/openathor/SKILL.md
```

安装后，Pi Agent 能理解：

- OpenAthor 项目结构
- 写作任务该如何分解
- 应该调用哪些 CLI 命令
- 哪些文件可以改，哪些文件需要谨慎改
- 修改正文时应该优先生成 diff
- 新增设定应当如何同步到 canon

## 4. 打开编辑器

用户使用自己熟悉的编辑器打开小说项目。

```bash
code my-novel
```

编辑器负责正文查看、手动编辑、搜索、文件管理和版本管理。

## 5. 打开 Pi Agent

用户在项目目录中启动 Pi Agent。

```bash
pi
```

Pi Agent 是用户的智能助手。OpenAthor 不再额外提供自己的 TUI。

## 6. 对话式创作

用户通过自然语言发起任务：

- 帮我完善故事设定
- 生成第一卷大纲
- 继续写第 4 章
- 把第 4 章重写得更紧张
- 检查第 6 章人物动机是否成立
- 提取最近三章新增的设定
- 更新人物当前状态
- 导出完整 Markdown

Pi Agent 根据 OpenAthor skill 调用 CLI，CLI 负责读取项目、生成上下文、输出结构化结果或 diff。
