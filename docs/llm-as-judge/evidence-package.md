# Evidence Package

## 目标

LLM-as-judge 不能只看最终正文。OpenAthor 的 judge 输入必须先形成可审计的 evidence package，让 deterministic checks、真实 Operator Agent 运行和 judge 评分使用同一份证据。

## 当前 smoke 入口

自动化 smoke 入口：

```bash
npm run test:judge:smoke
```

该命令执行内置 smoke 场景，生成并校验 judge evidence package 的结构，但默认不写文件、不调用模型。

需要保存证据包时使用：

```bash
npm run judge:smoke
```

输出目录：

```text
evals/smoke/
```

需要把真实 Pi Agent/Operator Agent 运行记录附到单个 smoke 场景时，必须显式指定场景：

```bash
node dist/judge-smoke.js \
  --scenario draft-confirm-write \
  --operator-transcript evals/manual/draft-confirm-write-transcript.md \
  --agent-final-response evals/manual/draft-confirm-write-final.md \
  --out-dir evals/smoke
```

`--operator-transcript` 和 `--agent-final-response` 都读取本地文本文件。只要附加真实证据，就必须同时使用 `--scenario <name>`，避免把 transcript 应用到错误的 evidence package。

## 当前 smoke 场景

第一版 smoke 覆盖两个已落地 fixture：

- `fixtures/slice-2/draft-confirm-write`
- `fixtures/slice-3/outline-archive`

选择这两个场景是因为它们分别覆盖确认写入正文和结构变更安全控制。

## Evidence Package 格式

当前 schema version：

```text
openathor.judge_evidence.v1
```

每个 evidence package 必须包含：

- `scenario`
- `fixture`
- `user_task`
- `operator_agent`
- `operator_transcript`，可选；附加真实 Operator Agent 运行记录时出现
- `deterministic_check`
- `agent_final_response`
- `judge_focus`
- `judge`

`deterministic_check` 必须包含：

- fixture workspace
- CLI command list
- 每条命令的 ok/error 状态
- 每条命令的 writes 和 warnings
- 文件变化摘要
- required/absent/unchanged 文件约束

`judge` 字段在自动化 smoke 中默认是 `needs_review`，并列出缺失证据：

- `real_operator_agent_transcript`
- `llm_judge_scores`

如果通过 `--operator-transcript` 附加了真实运行记录，`real_operator_agent_transcript` 会从 `missing_evidence` 中移除；`llm_judge_scores` 仍保留，直到手动评估流程写入真实 judge 分数。

这表示 smoke 已证明证据格式、deterministic replay 和本地 transcript attachment 可用。真实 Operator Agent transcript 和真实 judge 分数不进入必跑 CI，只作为本地或手动评估证据保存。

## 真实 Pi Agent 接入方式

真实 Pi Agent 运行时应复用同一个 evidence package 结构：

1. 以自然语言用户任务启动 Operator Agent。
2. 记录 Pi Agent 调用的 CLI 命令和 JSON 输出。
3. 记录文件 diff 或 file changes。
4. 记录 Pi Agent 给用户的最终回复。
5. 把这些证据交给 QA/Judge Agent 按 rubric 评分。

真实 judge 报告不得覆盖 deterministic check 结论。只要 schema、文件安全、hash、doctor 或 disallowed writes 失败，场景直接失败。
