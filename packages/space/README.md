# dsh-space

DSH 多项目工作区插件。它扩展核心 workspace，而不是另建一套会话归属系统。

插件提供两条创建路径：

- **工作区（space）**：在托管根下建立固定壳目录，将壳登记为核心 workspace，再写入插件附加注册表
- **对话（chat）**：按本地日期自动建立目录，将目录登记为核心 workspace，再写入插件附加注册表

```text
~/Documents/dsh/                   ← 托管根（settings 中可修改）
├── spaces/<工作区名称>/           ← 工作区固定壳目录
│   ├── projects/<成员>            ← link 成员的 symlink
│   └── docs/ notes/ …             ← 工作区级资产展开点
└── chats/<本地日期>/<slug>/        ← 对话目录，重名追加 -2、-3…
```

## 领域模型

### 核心 workspace

核心 `workspaceRegistry` 是会话归属的唯一权威：

- 每个工作区壳目录对应一条核心 workspace 记录
- 每个对话目录对应一条核心 workspace 记录
- 会话归属只读取核心记录的 `sessionIds`
- 插件不保存 `sessionId`，也不根据会话 cwd 猜测或补偿归组

核心 workspace 会按会话头部的 cwd 校验 `sessionIds`。因此，工作区新会话必须从固定壳目录对应的核心 workspace 创建。

### 插件附加注册表

插件注册表存于 dsh settings 的 `dsh-space` 命名空间，只描述核心 workspace 不表达的信息：

- 工作区 id、名称、固定壳目录和核心 `workspaceId`
- 成员目录、挂入方式、显示名和说明
- 唯一的主成员标记 `primary`
- 对话目录和核心 `workspaceId`

`workspaceId` 是对核心记录的稳定引用。`workspace.path` 只用于核对该记录是否仍指向预期壳目录，不作为插件注册表的身份键。

### 壳目录与成员

- **壳目录**是工作区稳定入口，创建后不随 `primary` 改变
- **成员目录**是工作语境的附加描述，不注册为独立 workspace，也不是会话入口
- `reference` 只记录成员真实目录，默认使用，不改动磁盘结构
- `link` 在壳内 `projects/` 下建立 symlink，必须显式选择
- `primary` 只表示主成员，不改变壳目录、核心绑定、cwd 或会话归组

前端目前会把主成员排在成员列表首位作为展示效果；这不是注册表顺序不变量，也不属于 `setPrimary` 的领域语义。

## 创建流程

### 新建工作区

UI 的“新建工作区”打开创建弹窗，提交后由统一操作模块顺序完成：

1. 校验工作区名称和可选首成员
2. 建立或复用 `spaces/<名称>/` 壳目录
3. 用壳目录登记或取得核心 workspace
4. 可选地以 `reference` 或 `link` 挂入首成员
5. 写入插件附加注册表

所有 UI、HTTP、模型工具和 `/space` 命令的写操作都通过同一个 `SpaceOperations.execute()` 接口串行执行，避免调用方各自拼接半套流程或用旧快照覆盖新状态。

### 新建对话

UI 的“新建对话”无需弹窗，单击后顺序完成：

1. 在 `chats/<本地日期>/` 下建立 `new-chat` 目录，重名时追加序号
2. 将该目录登记为核心 workspace
3. 写入对话附加记录
4. 用返回的 `workspaceId` 打开新会话

## 诊断与修复

`doctor` 只读检查目录与绑定，不在启动或渲染时静默改写异常数据。

| 状态 | 含义 |
| --- | --- |
| 悬空绑定 | 插件持有的 `workspaceId` 在核心注册表中不存在 |
| 错位绑定 | 核心记录存在，但其 path 与工作区壳或对话目录不一致 |
| 共享记录 | 两个工作区引用同一核心 workspace id |
| 共享壳目录 | 两个工作区记录使用同一壳目录 |
| 壳目录缺失 | 插件结构仍在，但壳目录已从磁盘消失 |
| 成员异常 | 成员目录缺失或 link 已断裂 |

显式 `rebind` 会按当前壳目录或对话目录重新取得核心 workspace，并更新插件的 `workspaceId`。它不会迁移历史会话，也不会在正常读取路径中自动触发。

## 客户端

客户端接管 `sidebar.workspaces` 单插槽并展示：

- 工作区卡片、成员和核心 `sessionIds` 下的会话
- 按日期分组的对话及其会话
- 核心没有归属账目的未归组会话
- 核心绑定同步中、有效、悬空或错位的状态
- 绑定悬空或错位时独立显示“修复绑定”，不会把“新会话”点击隐式变成修复动作

浏览器侧只使用两条 HTTP 路由：

- `GET /api/dsh-space/registry`：读取运行时注册表快照
- `POST /api/dsh-space/ops`：执行统一写操作

不存在 cwd 批量认领接口。`localStorage['dsh-space.sidebar.off'] = '1'` 后刷新可恢复官方侧边栏，清除该键后重新启用插件侧边栏。

## 工具与命令

- 模型工具 `space`：`list`、`create`、`attach`、`detach`、`primary`、`title`、`desc`、`doctor`、`rebind`、`chat`、`chatdrop`、`drop`
- 用户命令 `/space`：对应子命令以及 `status`
- 上下文注入：仅当会话 cwd 位于工作区壳目录子树时注入工作区地图

## 迁移边界

注册表 v2 的运行时不变量是：每个工作区都有 `shell` 和 `workspaceId`，每个对话都有 `workspaceId`。无壳、未绑定只作为 v1 旧注册表的启动输入：初始化时一次性建立缺失壳或绑定，然后保存为 v2；运行时不保留无壳模式。结构不完整的 v2 会直接拒绝，而不是继续扩张兼容分支。

已有 v2 的悬空、错位绑定和磁盘缺失目录会原样保留，交给 `doctor` 报告或显式 `rebind` 处理。未知的未来版本会直接拒绝，避免旧代码静默覆盖新格式。

旧无壳工作区提升到新壳后，历史会话不会自动迁移。核心 `sessionIds` 会继续按不可变的会话头 cwd 校验，而历史 cwd 仍指向旧目录，所以这些会话可能进入未归组；新建会话不再受 `primary` 切换影响。

## 读写边界

- dsh 沙盒不限制读取成员目录
- `workspace-write` 只允许写会话 cwd 子树；壳外 `reference` 成员和 realpath 后离开壳的 link 目标可能被拒绝写入
- `detach` 只移除成员记录，并删除插件创建的壳内 symlink；真实目录不动
- `drop` 和 `chatdrop` 只删除插件附加记录；核心 workspace、会话日志和磁盘目录不动
- 删除核心 workspace 后，其会话由核心行为转入未归组；插件绑定会显示为悬空

## 安装

```bash
dsh plugin --profile web add link:<本仓库路径>/packages/space
```

构建后重启 dsh 使插件生效。
