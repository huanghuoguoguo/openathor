# Errors

错误合约用于让 Pi Agent 能稳定解释失败原因并指导用户恢复。

## 错误码格式

错误码使用 `OA_` 前缀和大写蛇形命名：

```text
OA_PROJECT_NOT_FOUND
OA_PROTOCOL_UNSUPPORTED
OA_ADOPT_AMBIGUOUS_CHAPTER_ORDER
OA_OUTLINE_TARGET_REQUIRED
OA_OUTLINE_TARGET_NOT_FOUND
OA_OUTLINE_SPLIT_INVALID
OA_MANUSCRIPT_CHANGED
OA_CANON_CONFLICT
OA_OUTLINE_BROKEN_REFERENCE
```

## 错误分类

- `OA_PROJECT_*`：项目根目录、路径、缺失文件
- `OA_PROTOCOL_*`：协议版本和 schema
- `OA_ADOPT_*`：接管、导入和文件分类
- `OA_INDEX_*`：SQLite、文本索引和向量索引
- `OA_CONTEXT_*`：上下文生成和检索
- `OA_OUTLINE_*`：大纲、章节、场景和引用
- `OA_CANON_*`：canon 状态、冲突和确认
- `OA_WRITE_*`：写入、diff、hash 冲突
- `OA_INTERNAL_*`：不可恢复内部错误

## 退出码

```text
0  success
1  recoverable user/project error
2  invalid command usage
3  protocol or schema error
4  write conflict
5  internal error
```

## Recoverable

每个错误都应标明是否可恢复：

```json
{
  "code": "OA_MANUSCRIPT_CHANGED",
  "message": "章节 ch_00012 在本次操作期间被用户修改。",
  "recoverable": true,
  "hints": [
    "请重新运行 openathor context chapter ch_00012 --json。",
    "检查用户手写改动后再重新生成 diff。"
  ]
}
```

## Agent 回复原则

Pi Agent 看到错误后应：

- 简短解释失败原因
- 说明是否已写入文件
- 给出下一步可执行建议
- 不编造 CLI 没有提供的结果

## 禁止行为

- 不只返回自然语言错误
- 不把用户可恢复错误当内部崩溃
- 不在失败后继续执行高风险写入
- 不隐藏 warnings 或 conflicts
