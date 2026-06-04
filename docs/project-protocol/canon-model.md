# Canon Model

Canon 是 OpenAthor 维护长篇小说一致性的核心。它回答的是：哪些事实已经确认发生、哪些只是模型推断、哪些需要用户决定。

## 三类状态

### confirmed

用户确认过，或正文中明确写出的事实。

保存位置：

```text
bible/canon.md
```

### pending

模型从正文、设定或上下文中提取出的高置信推断，但用户尚未确认。

保存位置：

```text
bible/canon.pending.md
```

### question

无法判断、互相冲突或需要用户补充的问题。

保存位置：

```text
notes/import-questions.md
notes/unresolved.md
```

## Canon 条目

Markdown 中的 canon 条目应包含足够证据，方便用户审查：

```markdown
## canon_0017: 母亲的项链

- status: confirmed
- type: item
- source: manuscript/chapter-008.md
- source_ref: ch_00008
- related: [item_mother_necklace, char_male_lead]
- statement: 母亲留下的银色项链是男主追查旧案的关键物证。
```

格式可以演进，但必须保留：

- 状态
- 来源
- 相关 ID
- 事实陈述

## 同步规则

`openathor canon sync` 默认生成 diff，不直接静默写入 confirmed canon。

允许自动进入 pending：

- 从已写正文中提取的人物状态
- 从章节摘要中提取的伏笔
- 从接管流程中识别出的高置信设定

需要用户确认后才能进入 confirmed：

- 模型推断出的动机
- 多处文本有冲突的事实
- 会改变后续剧情约束的新设定
- 从废稿、灵感或 notes 中提取的内容

## 冲突处理

当用户请求与 confirmed canon 冲突时，Pi Agent 应先说明冲突，不直接改写 canon 或正文。

CLI 应提供结构化冲突信息：

```json
{
  "conflicts": [
    {
      "canon_id": "canon_0017",
      "source": "bible/canon.md",
      "statement": "母亲的项链是关键物证。",
      "user_request": "让项链只是普通装饰。"
    }
  ]
}
```

## 不变量

- pending 不能被当作 confirmed 使用
- question 不能被自动合并到 canon
- confirmed canon 的修改必须可审查
- 删除或归档章节不能静默删除其中的 confirmed canon
- 写作前的 context 必须区分 confirmed、pending 和 question
