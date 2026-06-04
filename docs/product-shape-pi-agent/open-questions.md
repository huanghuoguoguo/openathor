# Open Questions

## 已决策

- Pi Agent skill 默认安装到项目级 `.pi/skills/openathor/SKILL.md`，可选全局安装到 `~/.pi/agent/skills/openathor/SKILL.md`。
- Pi Agent + GLM-5 runtime 可用；已验证模型调用、显式 skill 加载、本地 bash 调用、JSON 读取和受控编辑。
- `adopt` 默认只建立索引和 OpenAthor 元数据，不复制或标准化原稿。
- diff 和确认流程由 Pi Agent 负责交互，CLI 负责生成结构化 diff、writes、warnings 和 conflicts。
- canon 同步默认生成待确认 diff；模型推断进入 pending，不自动进入 confirmed。
- 章节 ID 使用顺序型稳定 ID，例如 `ch_00012`；展示顺序可以变化，ID 不变。
- 插章后只更新 display order 和索引，不自动重命名已有文件。
- 故事资产关联先使用 YAML 显式引用，后续可生成派生 graph。
- Slice 1 SQLite schema 只需要覆盖 deterministic index，不需要完整图谱和向量检索。
- 向量检索当前只预留接口和目录；首个实现不做本地向量后端。
- Pi sub-agent 开发/测试阶段可用于 findings、patch suggestions、fixture reports 和 judge reports；产品运行时不依赖 sub-agent。
- `.pi/agents/` 只作为后续可选输出目录，不是首个实现切片要求。
- sub-agent 不直接写用户正文、confirmed canon 或核心协议决策，只返回 findings 或建议。
- 风格画像保存为 `style/profiles.yaml` 结构化事实源，`bible/style.md` 作为用户可读主说明。
- `style check` 不进入 Slice 1；先由 LLM judge 评估写作风格，后续进入 Slice 2+。
- 用户要求模仿在世作家时，OpenAthor 只提取抽象风格维度，不复制独特表达，不把作家名字作为可执行规则。
- 风格参考文本授权状态使用 `user_owned`、`licensed`、`public_domain`、`unknown`；`unknown` 只能用于问题提示，不能自动生成 confirmed style profile。
- 第一实现切片不要求 Git 集成。

## 待决策

- 已有小说的 `.txt`、`.md`、`.docx` 支持范围如何排序？
- 接管已有稿件时，canon 提取做到什么粒度才算首个完整纵切足够？
- `openathor draft` 是否应该直接调用模型，还是只负责准备上下文和文件写入？
- `chapters.yaml` 是否足够，还是需要更结构化的 scene card？
- 删除章节默认归档多久，是否提供物理删除命令？
- 向量索引未来按章节、场景、段落还是资产粒度切分？
- embeddings 未来由 OpenAthor 生成，还是交给 Pi Agent/外部模型生成？
- Pi sub-agent 适配未来应支持哪些具体扩展或文件格式？
