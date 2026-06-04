# OpenAthor

OpenAthor 是一个面向 Pi Agent 的小说创作工具链，目标是让用户在自己熟悉的文本编辑器中写作，并通过 Pi Agent 完成小说项目的规划、续写、审稿、改稿和设定维护。

当前项目处于前期产品和协议准备阶段，暂不编写产品代码。

## 产品方向

OpenAthor 当前产品轨道不做自研 TUI，也不做网页编辑器。核心产品形态是：

```text
用户自选文本编辑器
  + Pi Agent CLI
  + OpenAthor Pi Skill
  + OpenAthor Agent-facing CLI
  + OpenAthor Project Protocol
```

用户可以使用 VSCode、Obsidian、Typora、Neovim、Zed 等编辑器管理正文和设定文件；Pi Agent 作为智能助手，通过 OpenAthor Skill 调用 OpenAthor CLI。

## 核心目标

- 支持从零创建小说项目
- 支持非侵入式接管已经写了一半的小说
- 维护长期一致的 canon、人物、时间线和伏笔
- 让 Pi Agent 基于结构化上下文继续写作
- 所有重要修改尽量以 diff 呈现
- 保持本地优先，用户始终拥有自己的文本文件

## 当前状态

当前仓库主要包含产品和开发前准备文档：

```text
docs/
  index.md
  pre-development.md
  pre-development/
  product-shape-pi-agent.md
  product-shape-pi-agent/
  project-protocol.md
  project-protocol/
  cli-contract.md
  cli-contract/
  decisions.md
  decisions/
.codex/
  skills/
AGENTS.md
```

## 文档入口

- [文档总入口](docs/index.md)
- [前期准备](docs/pre-development.md)
- [Pi Agent 优先产品形态](docs/product-shape-pi-agent.md)
- [项目协议](docs/project-protocol.md)
- [CLI 合约](docs/cli-contract.md)
- [产品和架构决策](docs/decisions.md)

## 开发原则

在以下内容完成前，不进入产品代码实现：

- 产品形态
- 目标用户故事
- OpenAthor 项目协议
- CLI 命令合约
- Pi Skill 行为规范
- 接管已有小说流程
- 验收样例和测试夹具策略
- 产品和架构防偏移规则

## 贡献说明

贡献前请先阅读 [AGENTS.md](AGENTS.md)。当前阶段的主要贡献方向是完善产品文档、项目协议、CLI 合约、目标验收场景和防偏移规则。
