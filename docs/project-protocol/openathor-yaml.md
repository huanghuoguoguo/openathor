# OpenAthor YAML

`openathor.yaml` 是 OpenAthor 项目的根配置文件。Pi Agent 和 CLI 通过它识别项目根目录、协议版本和关键路径。

## 目标格式

```yaml
protocol_version: 0.1

project:
  id: novel_001
  title: 未命名小说
  language: zh-CN
  created_at: "2026-06-04T00:00:00Z"
  source_policy: plaintext

agent:
  primary: pi
  skill: openathor-pi
  skill_version: 0.1

paths:
  bible: bible
  outline: outline
  manuscript: manuscript
  notes: notes
  reviews: reviews
  runs: runs
  manuscript_index: .openathor/manuscript.index.yaml
  sqlite_index: .openathor/index.sqlite
  vector_index: .openathor/vector

features:
  vector_search: optional
  sub_agents: optional
```

## 字段规则

- `protocol_version`：项目协议版本。CLI 必须拒绝不支持的 major version，并给出迁移提示。
- `project.id`：项目稳定 ID，不依赖目录名。
- `project.title`：用户可读标题，可以修改。
- `project.language`：默认写作语言，用于 prompt、分词和导出策略。
- `project.source_policy`：当前固定为 `plaintext`。
- `agent.primary`：第一目标 agent，当前为 `pi`。
- `paths.*`：允许未来调整目录名，但所有路径必须相对项目根目录。
- `features.*`：声明可选能力，不代表能力一定已启用。

## 版本策略

`protocol_version` 使用 `major.minor`。

- minor 变化可以向后兼容
- major 变化需要迁移命令或明确失败
- CLI 写入项目文件前必须确认协议版本可写

## 读取顺序

Pi Agent 进入目录后应先通过 CLI 识别项目：

```bash
openathor doctor --json
```

CLI 读取顺序：

1. 从当前目录向上查找 `openathor.yaml`
2. 校验 `protocol_version`
3. 解析 `paths`
4. 校验必要目录和事实源文件
5. 检查派生索引是否存在或过期

## 禁止行为

- 不从目录名推断项目 ID
- 不在未识别项目根目录时写入 OpenAthor 文件
- 不把缺失的派生索引当作项目损坏
- 不自动升级协议 major version
