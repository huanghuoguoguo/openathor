# Scenarios And Fixtures

## Fixture 原则

评估样例必须像真实小说项目，而不是只有几行文本的玩具样例。

每个 fixture 应包含：

- `openathor.yaml`
- `bible/`
- `outline/`
- `manuscript/`
- `notes/`
- `reviews/`
- `.openathor/` 可选索引或导入报告

每个 fixture 都应有一个 `expected/` 说明，描述任务完成后的可接受结果。

## 必备场景

### 1. 新建项目

用户要求从零创建小说。

评估重点：

- 是否先收集关键偏好
- 是否生成 bible 和 outline
- 是否避免一口气写整本书
- 是否让用户确认方向

### 2. 接管 3 章已有小说

评估重点：

- 是否识别章节顺序
- 是否不修改原始正文
- 是否提取人物、设定、时间线和伏笔
- 是否把推断放入 pending

### 3. 接管 30 章长篇小说

评估重点：

- 是否生成压缩上下文
- 是否能继续写第 31 章
- 是否不违背前 30 章核心事实
- 是否避免读全文导致上下文失控

### 4. 插入章节

评估重点：

- 是否创建稳定章节 ID
- 是否不重命名破坏后续引用
- 是否刷新后续 context
- 是否生成影响分析

### 5. 删除或归档章节

评估重点：

- 是否默认归档而不是物理删除
- 是否保留章节中的重要 canon
- 是否提示后续章节受影响

### 6. Canon 冲突

评估重点：

- 是否识别用户请求和 canon 冲突
- 是否先询问用户
- 是否不静默改写 confirmed canon

### 7. 局部改稿

评估重点：

- 是否只修改目标范围
- 是否不增加用户禁止的新剧情
- 是否输出可审阅 diff

### 8. 检索相关上下文

评估重点：

- 是否使用 `search` 或 `context`
- 是否引用真正相关的前文
- 是否不过度带入无关内容

### 9. 风格画像

评估重点：

- 是否确认参考文本来源或授权状态
- 是否提取抽象风格特征
- 是否避免复制原文表达
- 是否把风格规则保存为可审阅 profile

### 10. 风格一致性改稿

评估重点：

- 是否读取项目 style profile
- 是否保持已有小说风格
- 是否只修改目标范围
- 是否避免“仿某作家本人”的表述

## Fixture 命名

建议命名：

```text
fixtures/
  new-project/
  adopt-3-chapters/
  adopt-30-chapters/
  outline-insert/
  outline-archive/
  canon-conflict/
  revise-local/
  retrieval-context/
  style-profile/
  style-revise/
```

当前已落地 Slice 1 deterministic fixtures：

```text
fixtures/slice-1/
  new-project/
  adopt-3-chapters/
  scattered-drafts/
  adopt-ambiguous-order/
```

后续写作、结构变更、检索和风格相关场景仍需要在 Slice 2+ 落地，并接入 LLM-as-judge 证据包。
