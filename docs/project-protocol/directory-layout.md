# Directory Layout

## 标准项目结构

OpenAthor 的目标项目结构是：

```text
openathor.yaml
bible/
  premise.md
  style.md
  world.md
  characters.md
  timeline.md
  canon.md
  canon.pending.md
outline/
  volumes.yaml
  chapters.yaml
  scenes.yaml
manuscript/
  chapter-001.md
  chapter-002.md
notes/
  hooks.md
  unresolved.md
  import-questions.md
reviews/
  chapter-001.md
runs/
  run_20260604_001.json
.openathor/
  manuscript.index.yaml
  import-report.md
  index.sqlite
  vector/
```

## 目录职责

- `openathor.yaml`：项目根配置、协议版本和关键路径声明
- `bible/`：长期设定、人物、世界观、时间线、风格和 canon
- `outline/`：卷、章节、场景和故事结构
- `manuscript/`：标准化正文目录
- `notes/`：灵感、未解决问题、导入问题和非 canon 材料
- `reviews/`：审稿和改稿建议
- `runs/`：agent 每次运行的输入、输出、工具调用、diff 和摘要
- `.openathor/`：导入报告、稿件索引、SQLite、向量索引和缓存

## 事实源边界

事实源只能是用户可读、可编辑、可 Git 管理的明文文件：

- Markdown：正文、设定、审稿、说明
- YAML：项目配置、大纲、章节索引、资产引用
- JSON/JSONL：run 记录和可审计上下文包

`.openathor/index.sqlite` 和 `.openathor/vector/` 不能保存唯一不可恢复的用户内容。删除 `.openathor/index.sqlite` 后，`openathor index rebuild` 必须能从明文文件重建索引。

## 接管已有项目

接管已有小说时，OpenAthor 不要求用户先整理成标准目录。

原始正文可以继续留在用户原目录中，例如：

```text
正文/001-雨夜.md
正文/002-旧案.md
设定/人物.md
灵感/废稿-老师身份.md
```

OpenAthor 通过 `.openathor/manuscript.index.yaml` 建立章节 ID 到原始路径的映射。只有用户明确选择标准化时，CLI 才能复制或整理正文到 `manuscript/`。

## 不变量

- 不静默移动、重命名或删除用户原稿
- 不把废稿、灵感或模型推断当作 confirmed canon
- 不让内部引用依赖章节编号、展示顺序或文件名
- 不把缓存、SQLite 或向量索引当作事实源
- 不让 agent 绕过 CLI 直接维护派生索引
- 每个写入用户可见内容的操作都应能追溯到 run 记录
