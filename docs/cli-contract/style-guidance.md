# Style Guidance CLI

## 目标

`openathor style` 命令用于让 Pi Agent 检查和维护项目文风稳定性。

当前实现交付确定性检查、安全的参考文本分析、confirmed style profile 激活、写作 proposal 的 active style guidance，以及 hash 保护的 style revision 写入。CLI 不调用模型，不生成作家仿写规则，不把参考文本原文复制到 profile；修订正文必须由 Pi/Operator Agent 或用户在 CLI 外部生成。

## `openathor style analyze`

把用户授权参考文本分析为抽象 pending style profile，并记录 reference 来源。

```bash
openathor style analyze <path> [--profile-id <id>] [--name <name>] [--permission <permission>] [--source-type <type>] [--json] [--dry-run]
```

### Output data

`data` 包含：

- `mode: pending_profile`
- `reference`
- `profile`
- `metrics`
- `result`
- `recommendations`

`profile.status` 必须是 `pending`。`result.reference_text_copied` 必须是 `false`。

### Expected writes

非 dry-run 时写：

- `style/profiles.yaml`
- `style/references.yaml`
- `runs/run_*_style_analyze.json`

`style analyze` 不修改正文、不修改 `bible/style.md`，也不生成 confirmed profile。

### Errors

- `OA_STYLE_REFERENCE_REQUIRED`
- `OA_STYLE_REFERENCE_NOT_FOUND`
- `OA_STYLE_REFERENCE_UNSUPPORTED`
- `OA_STYLE_PROFILE_INVALID`
- `OA_STYLE_REFERENCE_PERMISSION_INVALID`
- `OA_STYLE_REFERENCE_SOURCE_INVALID`

## `openathor style profile show`

读取 `bible/style.md`、`style/profiles.yaml` 和 `style/references.yaml`。

```bash
openathor style profile show [--json]
```

### Expected writes

无。

## `openathor style profile apply`

把已审阅的 pending style profile 确认为 active project style。它不修改正文，不复制参考文本原文。

```bash
openathor style profile apply <profile-id> [--json] [--diff] [--dry-run]
openathor style profile apply <profile-id> --confirm --base-hash <sha256:...> [--json]
```

默认和 `--diff` 只返回 proposal/diff。确认写入必须提供最新 `style/profiles.yaml` hash；hash 不匹配时返回 `OA_STYLE_PROFILE_CHANGED`，不得写文件。

### Output data

`data` 包含：

- `mode`
- `profile_id`
- `profile`
- `base_hash`
- `current_hash`
- `diff`
- `result`
- `next_agent_action`

### Expected writes

confirmed apply 写：

- `style/profiles.yaml`
- `runs/run_*_style_profile_apply.json`

它不得写 manuscript、confirmed canon 或参考文本。

### Errors

- `OA_STYLE_PROFILE_INVALID`
- `OA_STYLE_PROFILE_NOT_FOUND`
- `OA_BASE_HASH_REQUIRED`
- `OA_STYLE_PROFILE_CHANGED`

## `openathor style check`

检查目标章节相对项目风格说明和其他章节基线的确定性指标。

```bash
openathor style check chapter <target> [--json] [--max-chars <count>]
```

### Output data

`data` 包含：

- `scope`
- `target`
- `method: deterministic_style_metric_scan`
- `read_only`
- `style_sources`
- `metrics`
- `rules`
- `rule_matches`
- `findings`
- `verdict`
- `recommendations`
- `style_guidance`

`style_guidance` 只把 `confirmed` 且 `active` 的 profile 作为写作指导。`pending` profile 会出现在 `pending_profile_ids` 和 `safety.pending_profiles_excluded` 中，但不会进入可执行 `rules`。

`metrics.target` 和 `metrics.baseline` 包含：

- `char_count`
- `sentence_count`
- `average_sentence_chars`
- `dialogue_line_count`
- `dialogue_ratio`
- `paragraph_count`
- `average_paragraph_chars`
- `action_detail_hits`
- `emotion_exposition_hits`

`verdict` 取值：

- `pass`
- `needs_review`
- `needs_revision`

### Warnings

- `OA_STYLE_REVIEW_CANDIDATE`：低严重度文风复核提示。
- `OA_STYLE_DRIFT_CANDIDATE`：确定性指标显示较明显漂移。

### Expected writes

无。

`style check` 不自动改稿、不写 `bible/style.md`，也不写 confirmed style profile。

### 当前限制

- 只做确定性指标和词项扫描，不是 LLM 文风判断。
- `avoid` 规则命中和句长偏移是复核提示，不代表自动判定作品质量。
- 解决 drift 时可以通过 `openathor style revise` 进入 proposal/diff/hash-confirm 流程。

## `openathor style revise`

创建或确认一个基于 confirmed style profile 和 `style check` 结果的改稿流程。CLI 只负责 proposal、diff、hash gate 和写入，不生成正文。

```bash
openathor style revise chapter <target> --goal "<goal>" [--json] [--dry-run]
openathor style revise chapter <target> --goal "<goal>" --text "<revised manuscript>" --diff [--json]
openathor style revise chapter <target> --goal "<goal>" --text "<revised manuscript>" --confirm-write --base-hash <sha256:...> [--json]
```

### Output data

`data` 包含：

- `mode: proposal | diff | confirmed_write`
- `goal`
- `target`
- `current_hash`
- `profile`
- `active_profile_present`
- `style_check`
- `diff`
- `result`
- `next_agent_action`

`result.reference_text_copied` 必须是 `false`。`diff.manuscript_generated_by_cli` 必须是 `false`。

### Expected writes

默认 proposal 写：

- `reviews/style-revise-<chapter-id>-<stamp>.md`
- `runs/run_*_style_revise.json`

`--diff` 和 `--dry-run` 不写文件。

confirmed write 写：

- 目标 manuscript source
- `outline/chapters.yaml`
- `.openathor/manuscript.index.yaml`
- `runs/run_*_style_revise.json`

### Safety rules

- confirmed write 必须提供 `--text` 和最新目标章节 `--base-hash`。
- hash 不匹配返回 `OA_MANUSCRIPT_CHANGED`，不得写文件。
- 没有 active confirmed style profile 时仍可 proposal，但必须返回 `OA_STYLE_ACTIVE_PROFILE_MISSING` warning。
- 不得把 pending style profile 当成 confirmed guidance。
- 不得声称 CLI 生成了修订正文。

### Errors

- `OA_STYLE_UNSUPPORTED_SCOPE`
- `OA_STYLE_REVISE_TEXT_REQUIRED`
- `OA_STYLE_REFERENCE_TEXT_COPIED`
- `OA_BASE_HASH_REQUIRED`
- `OA_MANUSCRIPT_CHANGED`

## 写作 proposal 中的 style guidance

`openathor context`、`openathor draft`、`openathor review` 和 `openathor revise` 会在 `context_pack.style_guidance` 暴露同一份风格指导：

- `active_profile_present`
- `active_profile_id`
- `active_profile`
- `confirmed_profile_ids`
- `pending_profile_ids`
- `rules.do`
- `rules.avoid`
- `safety.pending_profiles_excluded`
- `safety.reference_text_included: false`
- `safety.manuscript_generated_by_cli: false`

普通写作 proposal 不生成正文，只把 confirmed active style profile 变成 Pi/Operator Agent 可执行约束。若只有 pending profile，CLI 会报告 pending 被排除，agent 必须先让用户确认并执行 `openathor style profile apply ... --confirm --base-hash`。
