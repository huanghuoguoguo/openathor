# OpenAthor CLI Contract

本文档是 OpenAthor CLI 合约的路由页。详细内容拆分在 `docs/cli-contract/` 下。

## 目标

定义 Pi Agent 调用 OpenAthor 的稳定 agent-facing API。CLI 合约必须先服务目标产品形态，再服务具体实现切片。

实现可以先覆盖一部分命令，但命令命名、输出 envelope、错误码、写入安全和 diff 规则不能为了局部便利偏离目标合约。

## 阅读顺序

1. [Command Index](cli-contract/command-index.md)：目标命令面和实现切片
2. [Slice 1 Protocol Kernel](cli-contract/slice-1-protocol-kernel.md)：首个实现切片的命令级合约
3. [Slice 2 Context](cli-contract/slice-2-context.md)：写作闭环的只读上下文包合约
4. [Slice 2 Writing Loop](cli-contract/slice-2-writing-loop.md)：规划、续写准备、审稿、改稿和 canon sync proposal 合约
5. [Slice 3 Structural Editing](cli-contract/slice-3-structural-editing.md)：结构查看、影响分析和安全归档合约
6. [Slice 4 Search](cli-contract/slice-4-search.md)：确定性文本检索合约
7. [Output Formats](cli-contract/output-formats.md)：JSON、diff 和结构化输出
8. [Write Safety](cli-contract/write-safety.md)：写操作、dry-run、diff 和冲突保护
9. [Errors](cli-contract/errors.md)：错误码、退出码和恢复建议

## 当前结论

OpenAthor CLI 是 agent-facing 工具层：

- 所有 agent-facing 命令支持 `--json`
- 高风险写操作支持 `--dry-run` 或 `--diff`
- 命令输出必须包含 stable ID、source files、warnings 和 writes
- 错误必须结构化，方便 Pi Agent 向用户解释和恢复
- CLI 负责确定性项目操作，skill 只负责任务路由和行为约束
- agent 不应直接修改 SQLite、向量索引或派生缓存
- CLI 实现语言锁定为 TypeScript/Node.js，不使用 Python
- `openathor context` 已作为 Slice 2 的只读入口落地
- `openathor outline show/impact/insert/move/archive` 已作为 Slice 3 结构编辑最小闭环落地
- `openathor search text/related` 已作为只读确定性检索入口落地
