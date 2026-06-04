# OpenAthor Project Protocol

本文档是 OpenAthor 项目协议的路由页。详细内容拆分在 `docs/project-protocol/` 下。

## 目标

定义一本小说项目在文件系统中的目标形态，让 Pi Agent、OpenAthor CLI 和用户编辑器都围绕同一套稳定协议工作。

项目协议不是实现细节，而是 OpenAthor 的核心产品资产。实现可以分阶段推进，但不能临时发明与目标协议冲突的目录、ID、索引或 canon 模型。

## 阅读顺序

1. [Directory Layout](project-protocol/directory-layout.md)：项目目录、事实源和派生数据边界
2. [OpenAthor YAML](project-protocol/openathor-yaml.md)：项目根配置和协议版本
3. [IDs And References](project-protocol/ids-and-references.md)：稳定 ID、展示顺序和资产引用
4. [Canon Model](project-protocol/canon-model.md)：confirmed、pending、question 的 canon 规则
5. [Manuscript Index](project-protocol/manuscript-index.md)：接管已有稿件的索引格式
6. [Style Profiles](project-protocol/style-profiles.md)：风格画像、参考文本和授权状态
7. [Schema And Fixtures](project-protocol/schema-and-fixtures.md)：Slice 1 schema 和 fixture 决策

## 当前结论

OpenAthor 项目必须满足以下原则：

- 明文 Markdown/YAML/JSON 是唯一事实源
- `.openathor/` 下的数据都是可删除、可重建的派生数据
- 章节、场景和故事资产使用稳定 ID
- 展示顺序、文件名和内部引用分离
- 接管已有小说默认非侵入式，不强制移动用户原稿
- 模型推断默认进入 pending 或 question，不直接进入 confirmed canon
- 风格控制使用抽象 style profile，不复制参考文本表达
- 所有高风险写操作必须能解释来源、输出 diff，并记录 run
