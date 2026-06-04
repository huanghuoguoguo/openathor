# Storage And Retrieval

## 产品判断

OpenAthor 应采用“明文文件为事实源，数据库为派生索引”的架构。

用户真正拥有的小说项目必须是可读、可编辑、可备份、可 Git 管理的文件。SQLite、Chroma 或其他向量库可以提升检索和性能，但不应成为唯一事实源。

## 存储分层

### Source Of Truth

事实源使用明文文件：

- Markdown：正文、设定、审稿、说明
- YAML：结构化项目配置、大纲、章节索引、资产引用
- JSONL/JSON：运行记录、派生上下文包

这些文件必须足够完整，即使删除所有数据库索引，项目仍然可以被 OpenAthor 重新扫描和恢复。

### Derived Index

SQLite 可以作为派生索引，用来加速：

- 文件路径和章节 ID 映射
- 章节、场景、人物、地点、伏笔的关系查询
- 文件 hash 和变更检测
- run 记录查询
- context pack 生成
- doctor 检查

建议位置：

```text
.openathor/index.sqlite
```

SQLite 可以删除后重建，不应保存唯一不可恢复的用户内容。

### Retrieval Index

向量检索可以作为可选派生索引，用来处理长篇小说的相关性检索。

建议位置：

```text
.openathor/vector/
```

首个实现切片不需要直接引入 Chroma。可以先定义检索接口和索引目录，后续再选择 SQLite vec、Chroma、LanceDB 或其他实现。

## 为什么不全部用数据库

全数据库方案会带来几个问题：

- 用户不能直接用普通编辑器理解项目
- Git diff 不友好
- 数据损坏或迁移成本更高
- agent 很难透明地解释改了什么
- 和“本地文件优先”的产品定位冲突

OpenAthor 的信任基础是：用户随时能打开文件，看到自己的小说和设定。

## 为什么需要 SQLite

全部只用明文文件也不够。

长篇项目会有很多需要稳定、快速、可验证的查询：

- 第 23 章引用了哪些人物和伏笔
- 某个道具第一次出现在哪里
- 插入章节后哪些后续章节 context 失效
- 哪些文件在 agent 运行后被用户手动改过
- 某个 canon 被哪些章节依赖

这些用纯文件每次扫描会慢，也容易让 agent 自己乱拼上下文。SQLite 适合做本地确定性索引。

## 是否需要向量库

后续需要，但不是第一天必须实现。

长篇小说写到几十万字后，关键词和结构化关系不足以解决所有上下文问题。用户会问：

```text
找出前文所有类似“女主不信任父亲”的场景。
```

或：

```text
续写这一章时，找出和老师、旧案、雨夜电话最相关的前文。
```

这类任务需要语义检索。目标命令面应先保留接口：

```bash
openathor index rebuild
openathor search text "母亲的项链" --json
openathor search related chapter ch_00031 --json
```

首个实现切片可以只做文本搜索和结构化索引，向量检索作为后续可插拔能力。

## 推荐目标决策

首个实现切片：

- 明文文件作为唯一事实源
- `.openathor/index.sqlite` 作为可重建索引
- 不引入 Chroma
- 不要求用户安装独立数据库服务
- 先实现文本搜索、结构化关系查询和文件 hash 检测
- 为向量检索预留 CLI 和索引目录

后续：

- 增加可选 embeddings
- 增加向量索引
- 支持按章节、场景、人物、伏笔生成 embedding
- 支持相似场景和相关上下文检索

## 数据一致性原则

- 写操作先修改明文事实源
- 再更新或标记派生索引失效
- `doctor` 能发现索引过期
- `index rebuild` 能从明文文件重建索引
- agent 不应直接修改 SQLite 或向量库
- 所有用户可见内容必须能在明文文件中找到来源

## 对 Pi Agent 的影响

Pi Agent 不应该自己扫描全项目拼上下文，而应该调用 CLI：

```bash
openathor context chapter 31 --json
openathor search text "项链" --json
openathor outline impact ch_00008 --json
```

CLI 负责从明文文件、SQLite 索引和可选检索索引中生成稳定结果。Pi Agent 负责解释、选择和与用户确认。
