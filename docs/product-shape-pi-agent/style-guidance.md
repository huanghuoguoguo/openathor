# Style Guidance

## 产品判断

OpenAthor 需要文风控制能力，但应定位为 style guidance，不应定位为 style imitation。

用户真实需求通常是让整本书风格稳定，从参考文本中学习节奏、句式、语气和叙事密度，让 agent 改稿时不破坏既有文风。

OpenAthor 可以支持分析用户授权参考文本并生成风格画像，但不应承诺复制某个具体作家的独特表达，也不应让 agent 声称“以某作家的文风写作”。

## 用户如何使用

用户可以说：

```text
分析 refs/style-sample.md，把它作为这本书的风格参考。
```

或：

```text
第 7 章续写时保持当前小说已有文风，叙述更冷静克制。
```

或：

```text
检查第 5 章和前 4 章文风是否明显不一致。
```

Pi Agent 应把这些请求转成 OpenAthor CLI 调用，生成或更新 style profile。

## 风格画像

风格画像应是抽象特征，而不是可复制文本片段。

建议文件：

```text
bible/style.md
style/
  profiles.yaml
  references.yaml
  samples/
    sample-001.md
```

`profiles.yaml` 示例：

```yaml
profiles:
  - id: style_main
    name: main narrative style
    source: user_reference
    status: confirmed
    traits:
      sentence_length: medium
      narration_distance: close_third_person
      pacing: restrained
      imagery_density: low
      dialogue_ratio: medium
      exposition_style: implicit
    do:
      - 使用克制的动作描写推动情绪
      - 保留悬疑信息差
    avoid:
      - 大段解释背景
      - 夸张比喻
      - 直接替角色总结情绪
```

## 参考文本来源

参考文本必须记录来源和授权状态。

```yaml
references:
  - id: ref_001
    path: style/samples/sample-001.md
    source_type: user_provided
    permission: user_owned_or_authorized
    allowed_use: style_analysis
```

OpenAthor 不应把参考文本原文塞进每次写作上下文。CLI 应提取风格画像，并在需要时只提供少量用户授权样例片段。

## 安全边界

OpenAthor 应拒绝或改写这些目标：

```text
完全模仿某在世作家的文风。
写得像某某作家本人写的一样。
复制这篇文章的句式和表达。
```

应改为：

```text
提取参考文本的高层风格特征，并生成不复制原文表达的原创文本。
```

如果用户提供的是自己的样稿、项目内已写章节或明确授权文本，可以用于更具体的风格校准。

## CLI 命令

建议命令：

```bash
openathor style analyze refs/style-sample.md --json
openathor style profile show --json
openathor style profile apply style_main --diff
openathor style check chapter 5 --json
openathor style revise chapter 5 --goal "更冷静克制" --diff
```

## 和写作流程的关系

写作前：

- `context` 应包含当前章节适用的 style profile
- 如果用户要求变更文风，应先说明影响范围

写作中：

- `draft` 使用 style profile 作为约束
- 不直接复制参考文本表达

写作后：

- `style check` 可以检查新章节和项目文风是否偏离
- 重大风格变化需要用户确认后写入 `bible/style.md`

当前实现中，`openathor style check chapter <target> --json` 已作为确定性只读检查落地。它比较目标章节与项目其他章节的句长、对话比例、段落长度、动作细节词项和情绪解释词项，并扫描 `bible/style.md` / `style/profiles.yaml` 中的 `avoid` 规则命中。它不调用模型，也不自动改稿。

## 首个纵切边界

首个完整纵切不必实现复杂风格学习模型，但应预留协议和 CLI 语义。

可先做：

- 初始化和接管项目时创建 `style/profiles.yaml` 与 `style/references.yaml`
- 用 `openathor style profile show --json` 读取当前 profile
- 让 `context` 暴露 style profile
- 用 `openathor style check chapter <target> --json` 做确定性风格漂移复核
- 在 `draft` 和 `revise` 中使用 style profile
- 用 LLM judge 检查风格一致性

暂不做：

- 自动分析参考文本并写入 confirmed profile
- 自动 style revise
- 自动判定任意作家风格
- 大规模风格库
- 按作家名字一键仿写
- 把受版权保护文本作为可复用训练资产
