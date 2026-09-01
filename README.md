# dsh-plugins

个人维护的 DeepSeek Harness 插件集。

## 插件

| 包 | 说明 |
| --- | --- |
| [dsh-space](packages/space/) | 多项目空间：工作区（壳目录 + 多成员注解）与对话（chats/<日期>/ 静默目录）两条创建路径，id-first 工作区绑定 + 空间地图注入 |

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
- 用户数据（空间定义等）以磁盘文件为权威载体（如 `space.yaml`），不锁在 dsh 内部存储里
- 当官方 web profile 出现会话级附加目录（/add-dir 类）或多根 workspace 时，重新评估相关插件的集成方式
