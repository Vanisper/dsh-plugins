# dsh-plugins

个人维护的 DeepSeek Harness 插件集。

## 插件

| 包 | 说明 |
| --- | --- |
| [dsh-space](packages/space/) | 基于官方 Workspace 的多项目附加描述与日期对话目录；核心 Workspace 拥有会话归属，插件停用后自然退化为官方模式 |

## 调研笔记

`docs/research/` 收录设计前期的对标调研（一手来源）：

- [会话级多目录机制（Codex CLI / Claude Code / Aider / Windsurf）](docs/research/multi-root-session-level.md)
- [编辑器侧多根工作区（VSCode / Cursor / JetBrains）](docs/research/multi-root-editor-level.md)

## 开发

```bash
pnpm install
pnpm run build       # 构建全部插件包
pnpm run test        # 单元测试
pnpm run typecheck   # 类型检查
pnpm run lint:fix    # lint + 自动修复
```

## 设计约定

- 插件不 patch、不 monkey-patch dsh 核心服务；只用公开的服务注入、工具/命令注册、上下文贡献等扩展点
- 核心 Workspace 注册表拥有 Workspace ID、目录、顺序和会话归属；插件设置只保存成员与类型等附加描述
- 当官方 web profile 出现会话级附加目录（/add-dir 类）或多根 workspace 时，重新评估相关插件的集成方式
