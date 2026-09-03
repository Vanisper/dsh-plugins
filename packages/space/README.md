# dsh-space

`dsh-space` 为官方 Workspace 增加多项目成员和按日期创建对话目录的附加描述。

## 设计边界

核心 `workspaceRegistry` 是唯一事实源：

- Workspace ID、固定入口目录、显示顺序和 `sessionIds` 均由核心服务拥有
- 侧栏按核心顺序展示所有 `plain`、`space` 和 `chat` 项
- 会话归属和组内顺序只读取核心 Workspace 的 `sessionIds`
- 插件设置只保存成员、主成员、成员说明和 Space/Chat 类型

因此，修改主成员不会改变会话目录、核心绑定或会话分组。删除插件描述也只会让核心行退化为普通官方 Workspace；停用插件后，核心 Workspace 和会话仍然可以由官方界面管理。

## 创建流程

“创建工作区”会在托管根的 `spaces/<name>/` 建立固定壳目录，再调用核心 Workspace 服务登记该目录，最后写入插件附加描述。“创建对话”使用 `chats/<YYYY-MM-DD>/<name>/`，同样先建立核心 Workspace，再写入 Chat 描述。

增强已有普通 Workspace 是显式操作，不会改变它的 ID、路径或历史会话。所有写操作串行执行，但每个操作真正开始时都会重新读取设置，外部设置变化不会被内存缓存覆盖。

## 接口

- `GET /api/dsh-space/registry`：读取完整的核心顺序投影
- `POST /api/dsh-space/ops`：执行 Space/Chat 附加描述操作
- `/space`：人类命令入口
- `space`：模型工具入口

本插件不代理官方 Workspace 的改名、删除、排序、会话归档、会话搜索或会话创建能力；这些动作由官方服务负责。
