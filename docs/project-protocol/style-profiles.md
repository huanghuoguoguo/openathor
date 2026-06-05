# Style Profiles

## 目标

Style profile 用于让 Pi Agent 在续写、审稿和改稿时保持项目文风稳定。

Style profile 是抽象风格约束，不是参考文本复制规则。

## 文件

```text
bible/style.md
style/
  profiles.yaml
  references.yaml
  samples/
    sample-001.md
```

`bible/style.md` 是用户可读的主风格说明。`style/profiles.yaml` 保存结构化风格画像。`style/references.yaml` 记录参考文本来源和授权状态。

当前 CLI 已支持 `openathor style profile show --json` 读取这些文件，并在 `openathor context` 中暴露 `style_profiles`。`openathor style check chapter <target> --json` 已支持确定性风格指标扫描，用于发现句长、对话比例、动作细节和 avoid 规则命中的漂移候选。`style analyze`、`style revise` 和 `style profile apply` 仍是目标命令面，当前返回结构化未实现错误。

## Profile 示例

```yaml
profiles:
  - id: style_main
    name: main narrative style
    status: confirmed
    source: user_reference
    references: [ref_001]
    traits:
      sentence_length: medium
      narration_distance: close_third_person
      pacing: restrained
      imagery_density: low
      dialogue_ratio: medium
      exposition_style: implicit
    do:
      - 使用克制的动作描写推动情绪
    avoid:
      - 大段解释背景
```

## Reference 示例

```yaml
references:
  - id: ref_001
    path: style/samples/sample-001.md
    source_type: user_provided
    permission: user_owned
    allowed_use: style_analysis
```

## 授权状态

参考文本授权状态：

```text
user_owned
licensed
public_domain
unknown
```

- `user_owned`：用户拥有或创作的文本
- `licensed`：用户声明有权用于风格分析的文本
- `public_domain`：公有领域文本
- `unknown`：授权不明，只能用于问题提示，不能自动生成 confirmed style profile

## 状态

Style profile 状态：

```text
confirmed
pending
archived
```

模型从参考文本中提取的风格画像默认进入 `pending`。用户确认后才能进入 `confirmed`。

## 不变量

- 不把参考文本原文作为每次写作的默认上下文
- 不把作家名字作为可执行风格规则
- 不承诺复制某个具体作家的独特表达
- 用户未确认的风格画像不能覆盖 confirmed style
- `draft` 和 `revise` 应读取适用的 confirmed style profile
- `style check` 的确定性 finding 是复核提示，不能自动改写正文或覆盖 confirmed style
