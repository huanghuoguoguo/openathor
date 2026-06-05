# Style Guidance CLI

## 目标

`openathor style` 命令用于让 Pi Agent 检查和维护项目文风稳定性。

当前实现交付确定性只读检查和安全的参考文本分析纵切，不调用模型，不生成作家仿写规则，不把参考文本原文复制到 profile。

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
- 解决 drift 时必须通过 `openathor revise` 或用户手动编辑进入确认流程。

## 未实现命令

以下命令仍返回结构化 `OA_COMMAND_NOT_IMPLEMENTED`：

- `openathor style revise`

这些能力仍是目标命令面，但不能伪装成已交付。
