# Target Validation

## 核心验收问题

OpenAthor 要证明的不是“模型能写小说”，而是：

> Pi Agent 能基于 OpenAthor Project Protocol 和 CLI Contract，可靠接管、理解、续写、审稿、改稿、维护 canon，并在长篇结构变化时保护用户已有内容。

## 必备验收样例

### 1. 新建项目

输入：

```text
使用 OpenAthor 创建一本都市悬疑小说。
```

期望：

- 创建项目结构
- 生成基础 bible
- 生成初始 outline
- 不直接生成整本书
- 记录初始化 run 或明确说明无需 run

### 2. 接管 3 章已有小说

输入目录包含 3 个章节文件。

期望：

- 识别章节顺序
- 建立 manuscript index
- 生成章节摘要
- 提取人物和设定到 pending
- 不修改原始正文

### 3. 接管 30 章已有小说

输入目录包含较长连载稿。

期望：

- 生成压缩上下文
- 提取当前人物状态
- 提取未解决伏笔
- 能继续写第 31 章
- 不与前 30 章核心事实冲突

### 4. 散稿目录

输入目录包含正文、设定、灵感、废稿和未知文件。

期望：

- 对文件进行分类
- 对不确定文件提出问题
- 不把废稿误认为 canon
- 不移动用户原文件

### 5. 局部改稿

输入为明确章节和目标段落。

期望：

- 只修改目标范围
- 输出 diff
- 不改变后续剧情事实
- 检测用户手写冲突

### 6. Canon 冲突

输入任务与已有 confirmed canon 冲突。

期望：

- Pi Agent 先指出冲突
- 不直接改 confirmed canon
- 询问用户采用哪条设定

### 7. 结构变更

输入任务要求插章、移章或归档章节。

期望：

- 使用 stable chapter ID
- 先做 impact 分析
- 不破坏后续章节引用
- 需要用户确认的变更输出 diff

### 8. 长篇检索

输入任务需要查找相关前文。

期望：

- 使用 `context`、`search text` 或 `search related`
- 返回来源证据
- 不把无关章节塞入上下文

## 验收输出

每个样例都应保存：

- 输入目录结构
- 用户提示词
- 预期 CLI 调用
- 预期 JSON 输出形状
- 预期文件变化
- 预期 agent 回复摘要
- 不允许发生的行为

## Slice 1 Fixture 入口

正式实现前先落地 Slice 1 fixture：

```text
fixtures/slice-1/
  new-project/
  adopt-3-chapters/
  scattered-drafts/
  adopt-ambiguous-order/
```

测试侧入口：

```bash
openathor-fixture-check fixtures/slice-1/adopt-3-chapters
```

Slice 1 fixture check 先验证协议、文件、JSON envelope、expected writes 和 disallowed writes。它不评价文笔，也不调用 LLM judge。

## Blocking Failure

以下行为直接判定失败：

- 覆盖或删除用户正文
- 把 pending 当作 confirmed canon
- 静默改写 confirmed canon
- 插章或移章破坏已有 ID 引用
- 未检查上下文就生成正文
- CLI 写入结果无法追溯到 sources 和 writes
- 失败时没有结构化错误
