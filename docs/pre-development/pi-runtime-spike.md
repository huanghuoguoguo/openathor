# Pi Runtime Spike

## 结论

Pi Agent + GLM-5 可以作为 OpenAthor 的首个 Operator Agent 执行环境。

## 验证环境

- Pi Agent: `0.78.0`
- Provider: custom `jdcloud-anthropic`
- API: `anthropic-messages`
- Model: `GLM-5`
- Auth: bearer token via environment variable

Pi 配置使用：

```text
~/.pi/agent/models.json
```

OpenAthor 不应把用户 token 写入项目文件。模型凭证应来自用户环境变量或 Pi auth 配置。

## 已验证

- Pi 能识别 custom provider 和 `GLM-5`
- Pi 能完成非交互模型调用
- Pi 能通过显式 `--skill <path>` 加载 skill
- Pi 能调用本地 `bash`
- Pi 能读取本地命令输出的 JSON 并据此回复
- Pi 能对 `/tmp` 中的受控文件做小范围编辑

## 发现的问题

只通过自然语言提及 skill 名称时，模型可能不会自动加载临时 skill，而是去仓库文档中搜索。

因此 OpenAthor 不能依赖“模型自己猜 skill 名称”。`openathor skill install pi` 必须把 Pi Skill 安装到 Pi 可发现的确定路径。

## 安装决策

默认项目级安装：

```text
.pi/skills/openathor/SKILL.md
```

可选全局安装：

```text
~/.pi/agent/skills/openathor/SKILL.md
```

如果自动发现失败，用户可以显式启动：

```bash
pi --skill .pi/skills/openathor/SKILL.md
```

## 质量判断

Pi + GLM-5 的基础执行能力足够进入 Slice 1。

但它的写作质量、审稿质量和复杂任务稳定性不能靠一次 smoke test 判断。后续必须用 OpenAthor LLM-as-judge 体系评估：

- deterministic checks 先判断协议、文件、JSON、diff 和索引
- LLM judge 再判断上下文使用、用户体验、写作适配和审稿质量
- 安全性、canon 一致性和变更控制不达标时，不能进入对应产品场景
