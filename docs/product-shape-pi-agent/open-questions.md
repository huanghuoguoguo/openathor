# Open Questions

- Pi Agent skill 的安装位置和格式应如何定义？
- Pi Agent 是否能可靠调用本地 CLI 并读取 JSON 输出？
- `adopt` 默认应该只建立索引，还是复制一份标准化稿件？
- 已有小说的 `.txt`、`.md`、`.docx` 支持范围如何排序？
- 接管已有稿件时，canon 提取做到什么粒度才算 MVP 足够？
- `openathor draft` 是否应该直接调用模型，还是只负责准备上下文和文件写入？
- diff 的确认流程由 Pi Agent 负责，还是由 OpenAthor CLI 提供？
- canon 同步应该默认自动写入，还是默认生成待确认 diff？
- `chapters.yaml` 是否足够，还是需要更结构化的 scene card？
- 第一版是否需要 Git 集成？
