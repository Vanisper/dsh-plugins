# dsh-plugins

个人维护的 DeepSeek Harness 插件集。

这个仓库采用 pnpm monorepo：每个插件独立拥有源码、构建产物、使用说明和领域文档；仓库根目录只维护跨插件的入口、开发命令和通用约定。

## 当前插件

| 包 | 定位 | 文档 |
| --- | --- | --- |
| [`dsh-space`](packages/space/) | 基于官方 Workspace 的多目录组织、会话分组和日期对话目录 | [`packages/space/README.md`](packages/space/README.md) |

## 文档导航

- [文档总览](docs/README.md)：说明各类文档的职责和阅读顺序
- [`dsh-space` 实现设计](packages/space/docs/design.md)：领域模型、模块职责、状态流转、宿主接入和演进路线
- [`dsh-space` 上下文](packages/space/CONTEXT.md)：稳定术语和核心不变量
- [`dsh-space` 决策记录](packages/space/docs/adr/)：已经采用且需要长期保留的架构决策
- [`dsh-space` 调研材料](packages/space/docs/research/)：多目录工作区的一手资料对标

## 开发

```bash
pnpm install
pnpm run build       # 构建全部插件包
pnpm run test        # 运行全部测试
pnpm run typecheck   # 类型检查
pnpm run lint        # 检查代码风格
pnpm run lint:fix    # 检查并自动修复
```

## 仓库约定

- 插件通过公开的服务注入、工具/命令注册、上下文贡献和客户端 slot 接入宿主，不 patch 或 monkey-patch DSH 核心
- 每个插件的领域规则、架构决策和调研材料归档在对应的 `packages/<name>/` 下
- 根 README 不承载某个插件的实现细节；跨插件约定才放在仓库根文档
- 合并前至少通过构建、测试、类型检查和 lint
