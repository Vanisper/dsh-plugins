# dsh-space

`dsh-space` 是一个基于官方 Workspace 的多目录组织插件。它把多个真实目录组织成一个可理解的 Space，并为按日期创建的对话目录提供 Chat Workspace 描述。

## 定位

当前版本解决的是三件事：

- 目录成员的组织、命名和说明
- 核心 Workspace 与会话的分组、排序和侧栏投影
- 按本地日期创建独立的 Chat Workspace

跨目录读写权限属于宿主沙箱能力，不由 Space 描述自动授予。`reference` 和 `link` 是目录接入形态，不是权限开关。

## 核心模型

官方 `workspaceRegistry` 是唯一事实源：

- Workspace ID、canonical path、显示顺序和 `sessionIds` 由核心服务拥有
- 插件设置只保存 Space/Chat 类型、成员目录和展示元数据
- 会话归属和组内顺序只读取核心 Workspace 的 `sessionIds`
- 一个核心 Workspace 最多拥有一个插件描述

因此，修改主成员不会改变核心 Workspace 或会话归属。移除 Space/Chat 描述只会让核心行退化为普通 Workspace；停用插件不会清理或重排官方数据。

## 用户可见能力

侧栏在核心 Workspace 列表上叠加 Space 和 Chat 信息，并保留官方操作：

- 添加、重命名、移除和排序普通 Workspace
- 创建、搜索、重命名、分叉、归档和排序会话
- 打开 Workspace 目录
- 创建 Space、创建 Chat、添加或移除成员、设置主成员

附加描述接口不可用时，侧栏仍以核心列表为准，将所有行按普通 Workspace 展示。

## 创建与恢复

- Space：在托管根的 `spaces/<name>/` 创建固定壳目录，登记核心 Workspace，再写入 Space 描述
- Chat：在 `chats/<YYYY-MM-DD>/<name>/` 创建目录，登记核心 Workspace，再写入 Chat 描述
- 核心创建与插件设置写入不是原子操作，因此会保留短生命周期的 pending marker，失败重试时复用已经创建的路径和 Workspace ID
- 普通 Workspace 的增强是显式操作，不会改变其 ID、路径或历史会话

## 宿主接口

- `GET /api/dsh-space/registry`：读取核心顺序投影和失效描述
- `POST /api/dsh-space/ops`：执行 Space/Chat 附加描述操作
- `/space`：人类命令入口
- `space`：模型工具入口

客户端对核心 Workspace 和 Session 的操作直接调用官方服务，不通过插件 HTTP 接口代理。

## 文档

- [文档索引](docs/README.md)
- [实现设计](docs/design.md)
- [交互设计与验收](docs/ui.md)
- [领域上下文](CONTEXT.md)
- [架构决策](docs/adr/)
- [多目录工作区调研](docs/research/)

## 开发

在仓库根目录执行：

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run typecheck
pnpm run lint
```
