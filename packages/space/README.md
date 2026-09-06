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

- 置顶、独立对话和工作区三个分区，支持折叠与分区排序
- 混合置顶工作区与单个会话，不改变归属；独立对话平铺，长列表支持展开显示
- 添加、重命名、移除和排序普通 Workspace
- 创建、搜索、重命名、分叉、归档和排序会话
- 打开 Workspace 目录
- 创建 Space、创建 Chat、添加或移除成员、设置主成员
- 创建时添加零个或多个成员；成员编辑采用可取消草稿，一次保存并检查并发冲突
- 在侧栏底部双向切换空间模式和官方模式，按当前浏览器来源记忆选择

官方模式会撤销增强侧栏注册并移除其样式，恢复宿主原生工作区界面；只保留独立的模式切换入口。切换不修改任何工作区、会话、成员描述或权限。弹窗、原位编辑和提交期间暂不切换，避免丢失草稿或中断操作。

附加描述接口不可用时，侧栏仍以核心列表为准，将所有行按普通 Workspace 展示。
此时暂停移除工作区，避免把暂时不可见的描述当作不存在。全文搜索由宿主提供；索引未启用或暂不可用时仍可按会话标题匹配。
成员编辑发生外部冲突时保留当前草稿，可显式放弃并重新载入。侧栏支持键盘菜单、右键操作、折叠记忆和工作区拖动排序；菜单中的上移、下移同样适用于键盘和触屏。

工作区与项目内会话支持信息浮层和原位改名，长路径按需查看；会话行提供置顶和归档快捷动作。分区与置顶偏好按浏览器来源保存并跨页同步，不写入核心注册表。独立对话目录可从分区菜单单独管理。

## 创建与恢复

- Space：在托管根的 `spaces/<name>/` 创建固定壳目录，登记核心 Workspace，再写入 Space 描述
- Chat：在 `chats/<YYYY-MM-DD>/<name>/` 创建目录，登记核心 Workspace，再写入 Chat 描述
- 核心创建与插件设置写入不是原子操作，因此会保留短生命周期的 pending marker，失败重试时复用已经创建的路径和 Workspace ID
- 普通 Workspace 的增强是显式操作，不会改变其 ID、路径或历史会话
- 创建已完成但核心列表尚未同步时，表单只读；重试进入同一工作区，关闭表单不会删除已创建的工作区

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
- [上线验收记录](docs/acceptance.md)
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
