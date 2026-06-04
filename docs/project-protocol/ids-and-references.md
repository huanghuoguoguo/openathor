# IDs And References

OpenAthor 使用稳定 ID 维护长篇小说中的结构和资产关系。文件名、章节编号和展示顺序可以变化，内部引用不能因此失效。

## ID 类型

建议前缀：

```text
vol_     volume
ch_      chapter
sc_      scene
char_    character
loc_     location
org_     organization
item_    item
hook_    hook or foreshadowing
ev_      timeline event
theme_   theme or style rule
style_   style profile
ref_     style reference
run_     agent run
```

ID 使用小写字母、数字和下划线。ID 一旦写入事实源，不应因为标题、文件名、展示顺序变化而改变。

## 章节和展示顺序

章节应同时保存稳定 ID 和展示顺序：

```yaml
chapters:
  - id: ch_00012
    display_order: 12
    title: 雨夜来电
    status: drafted
    manuscript_path: manuscript/chapter-012.md
    summary: 男主收到匿名电话，意识到旧案没有结束。
    scenes: [sc_00012_01, sc_00012_02]
```

插章时，CLI 创建新的 `ch_` ID，并更新 `display_order`。已有章节的 ID 和引用不能改变。

## 场景引用

场景属于章节，但也有自己的稳定 ID：

```yaml
scenes:
  - id: sc_00012_01
    chapter_id: ch_00012
    status: drafted
    purpose: 制造匿名电话事件
    links:
      characters: [char_male_lead]
      locations: [loc_old_apartment]
      hooks: [hook_anonymous_caller]
      timeline_events: [ev_rain_call]
```

## 资产引用

故事资产之间的引用先使用 YAML 显式字段维护，后续可以由 CLI 生成派生 story graph。

```yaml
links:
  characters: [char_male_lead, char_teacher]
  locations: [loc_school_archive]
  items: [item_mother_necklace]
  hooks: [hook_teacher_identity]
  timeline_events: [ev_archive_break_in]
```

## 状态

章节和场景状态：

```text
planned
drafted
reviewed
revised
archived
```

资产和 canon 状态：

```text
confirmed
pending
question
archived
```

## 不变量

- 内部引用只使用 ID
- 文件路径只能作为定位字段，不能作为身份字段
- `display_order` 可以重排，ID 不重排
- 归档不等于删除，归档资产仍可被引用
- 删除或归档章节前必须能通过 `outline impact` 找到受影响引用
