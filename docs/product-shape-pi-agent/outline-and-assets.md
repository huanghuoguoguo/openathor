# Outline And Assets

## 产品判断

大纲管理是目标产品的核心能力，不是后续增强。

AI 写长篇小说时，真正的难点不是生成一章正文，而是当用户频繁改大纲、插章、删章、重排章节时，agent 仍然知道哪些内容已经发生、哪些只是计划、哪些设定不能被误改。

因此 OpenAthor 的大纲不应该只是一个 Markdown 文档，而应该是可变的结构化故事地图。

## 用户如何使用

用户仍然只和 Pi Agent 对话：

```text
把第 12 章和第 13 章之间插入一章，让男主第一次怀疑老师。
```

或：

```text
删除第 8 章，但保留里面关于母亲项链的设定。
```

或：

```text
从第 21 章开始重规划后续剧情，前 20 章事实不要改。
```

Pi Agent 根据 skill 调用 OpenAthor CLI 做结构变更、影响分析和关联更新。

## 大纲数据模型

建议把故事结构拆成三层：

- `volume`：卷或篇章阶段
- `chapter`：章节
- `scene`：场景

每一层都应有稳定 ID。章节编号和文件名可以变化，但 ID 不应变化。

```yaml
chapters:
  - id: ch_00012
    display_order: 12
    title: 雨夜来电
    status: drafted
    manuscript_path: manuscript/chapter-012.md
    summary: 男主收到匿名电话，第一次意识到旧案没有结束。
    scenes:
      - id: sc_00012_01
        purpose: 制造匿名电话事件
        status: drafted
    links:
      characters: [char_male_lead]
      locations: [loc_old_apartment]
      hooks: [hook_anonymous_caller]
      timeline_events: [ev_rain_call]
```

内部引用使用 `id`，用户界面和文件名使用 `display_order`。这样在两章中间插入新章时，不需要破坏已有引用。

## 章节操作

目标产品需要支持这些结构操作：

- 插入章节：在两章之间增加 planned 章节
- 删除章节：默认归档，不硬删除正文
- 移动章节：改变顺序并更新上下文索引
- 拆分章节：把一章拆成两章，保留来源关系
- 合并章节：把两章合成一章，保留来源关系
- 重规划：从某章之后重新生成后续大纲

建议命令：

```bash
openathor outline show --json
openathor outline insert --after ch_00012 --title "裂缝"
openathor outline move ch_00018 --after ch_00012
openathor outline archive ch_00008 --keep-facts
openathor outline split ch_00010 --scene sc_00010_03
openathor outline merge ch_00014 ch_00015
openathor outline replan --from ch_00021 --diff
openathor outline impact ch_00008 --json
```

## 删除章节

删除章节应默认是归档，而不是物理删除。

归档时需要保留：

- 原正文文件
- 章节摘要
- 已确认 canon
- 被其他章节引用的伏笔、道具、人物状态
- run 记录

如果用户说“删除第 8 章”，Pi Agent 应先做影响分析：

```text
第 8 章包含 3 个已确认设定、2 个伏笔、1 次人物状态变化。是否只归档章节并保留这些事实？
```

只有用户明确要求时，才删除文件。

## 插入章节

插入章节时不应简单重命名所有后续文件。

推荐行为：

1. 创建新的稳定章节 ID
2. 调整 `display_order`
3. 生成章节目标和场景卡
4. 标记后续章节 context 需要刷新
5. 检查后续章节是否引用了被延后的事件

文件名可以采用当前展示顺序生成，但引用关系不能依赖文件名。

## 大纲修改后的自动更新

自动更新分三类。

### 可以自动做

- 更新章节顺序
- 更新章节索引
- 更新上下文缓存失效状态
- 更新章节之间的 previous/next 关系
- 更新 run 记录
- 生成 diff

### 可以自动建议，但需要用户确认

- 更新 canon
- 更新人物状态
- 更新时间线
- 更新伏笔状态
- 删除或转移章节中的重要事实
- 重写后续章节摘要

### 不应自动做

- 删除用户正文
- 把模型推断写入 confirmed canon
- 大幅改变前文事实
- 静默重写已经完成的章节

## 资产关联

OpenAthor 需要维护“故事资产”之间的关系。

资产包括：

- 人物
- 地点
- 组织
- 道具
- 伏笔
- 时间线事件
- 章节
- 场景
- 主题和风格规则

当前实现不需要先做复杂图数据库，但目标协议必须在 YAML/Markdown 中保留稳定 ID 和引用字段。后续可以由 CLI 生成 `.openathor/story-graph.json` 作为派生索引。

## 工作流闭环

大纲、正文和 canon 的关系应是：

```text
outline = 计划发生什么
manuscript = 实际写了什么
canon = 已确认发生了什么
```

当三者不一致时，OpenAthor 不应静默修复，而应通过 `doctor` 或 `outline impact` 报告给用户。

例如：

```text
第 13 章大纲说女主没有见过凶手，但第 9 章正文已写她见过背影。需要确认是修改大纲、修改正文，还是把它作为误导性线索。
```

## 写作后资产沉淀

长篇验收不能只看正文是否生成，还要看新增人物、事迹、伏笔和章节摘要是否进入明文事实源。

当前实现提供 `openathor assets sync chapter <target> --from <asset-package> --json`：

- Pi Agent/Operator 负责从写作结果整理结构化资产包
- CLI 负责校验资产 ID、source hash、写入范围和 run 记录
- 默认只写 pending proposal，并输出本次确认写入需要保护的 `asset_hashes`
- `--confirm --base-hash` 和所有必要 `--assets-hash <path=hash>` 匹配时才追加新人物、新时间线事件、新伏笔，合并更新既有资产状态，并更新目标章节 outline links；如果用户在确认前手动更新了人物、时间线、伏笔或 outline，旧 asset package 必须停止写入
- 既有人物的最新 `current_state` 写回 confirmed 档案，旧状态以 `note: previous_state: ...` 保留，便于追踪人物事迹演进
- 同步后必须运行 `openathor assets audit --json` 检查 link drift 和 summary drift
- 接管既有长篇后，如果已确认人物在旧章节正文中出现但 outline links 缺失，可用 `openathor assets link-backfill characters` 走 proposal/confirm/hash-gate 流程，只回填章节人物 links，不新增资产或 canon
- 人物档案覆盖审计输出 coverage 证据；只有项目级词项覆盖偏低且匹配到的档案字段数不足时才发 weak warning，避免把“稳定人物身份没有每章重复写出”误报为漂移
- 多章写作验收必须覆盖“正文确认写入 -> 每章 asset package -> `assets sync --confirm` -> `assets audit`”的完整链路，不能只验最终小说文本是否存在

这让“人物性格、事迹和大纲是否漂移”变成可审计的文件变化，而不是只依赖 agent 最终回复。

## 成功标准

大纲管理的成功标准是：

- 用户可以插入、删除、移动章节而不破坏已有稿件
- Pi Agent 续写时能使用最新章节顺序和章节目标
- 删除或重排章节前能看到影响分析
- 重要资产不会因为章节变更被静默丢失
- canon 更新默认需要用户确认
