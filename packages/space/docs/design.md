# dsh-space 实现设计

## 目标

`dsh-space` 的目标是为官方 Workspace 增加稳定的多目录组织层，同时保持核心 Workspace 的身份、会话归属和生命周期不被复制或替代。

当前设计把能力分成两个可组合的层：

- **组织层**：Space/Member/Chat 描述、会话分组、侧栏投影和提示词上下文
- **权限层**：宿主沙箱决定的读写范围；未来可以消费组织层结果，但不改变组织层事实

因此，跨目录权限是同一机制的后续能力层，不是与多目录组织互斥的路线。

## 领域模型

```text
workspaceId -> canonical directory -> ordered sessionIds
       |
       +-> optional Space description -> members + primary
       +-> optional Chat description
```

### 核心 Workspace

官方 Workspace 拥有：

- 稳定 ID
- canonical path
- 显示标题和 Workspace 顺序
- 会话归属和组内顺序

插件只能通过适配器读取和调用这些能力。

### Space

Space 是一个核心 Workspace 的附加描述，包含成员目录、成员模式、展示标题、说明和主成员。它不拥有 Workspace 身份、会话归属或排序。

### Member

Member 指向一个真实存在的目录。当前有两种接入形态：

- `reference`：只引用真实路径
- `link`：在 Workspace 的 `projects/<linkName>` 下创建指向真实目录的符号链接

两种形态都不自动突破宿主沙箱。未来权限层可以根据成员集合派生额外根目录，但该结果应是请求期策略，而不是写回 Space 设置。

### Chat Workspace

Chat 是没有成员集合的核心 Workspace 附加描述。目录由插件按本地日期和名称创建，标题和会话归属仍由核心 Workspace 提供。

## 不变量

- 一个核心 Workspace 最多一个 Space 或 Chat 描述
- Space 内成员真实路径唯一
- `primary` 必须指向现有成员
- 成员引用不能产生不可消解的 title/basename 歧义
- 失效描述只报告，不根据路径自动迁移到新 Workspace ID
- 删除描述不删除核心 Workspace、目录、会话或会话日志
- 插件故障不能破坏核心 Workspace 数据

## 模块职责

```text
src/business/   领域规则与应用编排
src/store/      插件设置和 pending marker 适配器
src/workspace/  官方 workspaceRegistry 适配器
src/host/       HTTP、命令、工具和提示词接入
src/client/     侧栏投影、交互和客户端服务调用
src/shared/     路径、常量和日志等共享小模块
```

外部入口只调用业务编排；路径、设置和核心 Workspace 的具体实现不应泄漏到 UI 或宿主入口。

## 写操作链路

### 创建 Space/Chat

```text
validated
  -> pending marker created
  -> managed directory ready
  -> core Workspace ready
  -> optional member link ready
  -> plugin description persisted
  -> pending marker removed
```

核心 Workspace 与插件设置无法原子提交，所以失败时必须保留足够的 pending 信息，让下一次调用复用原路径和 Workspace ID，而不是猜测或重新接管普通 Workspace。

### 其他操作

所有设置写操作在单个插件实例内串行执行；每个操作真正开始时重新读取设置。成员链接只在与当前描述完全匹配时删除，避免触碰用户手工创建的文件或链接。

## 失效与降级

- 插件 HTTP 接口不可用：客户端展示核心 Workspace 的普通投影
- Space/Chat 描述找不到核心行：保留为 invalid record，不自动修复
- 核心 Workspace 目录暂时缺失：保留核心记录，不由插件删除
- 插件停用：官方 Workspace 和会话继续由宿主管理
- 设置写入失败：保留 pending marker，下一次创建操作执行确定性恢复

## 测试策略

当前单元测试覆盖路径规则、设置校验、成员链接、投影、操作队列和创建失败恢复。后续应补三类测试：

1. 真实 `dsh-workspace` 与 Cordis 注册/生命周期集成测试
2. HTTP、工具和提示词的宿主契约测试
3. 浏览器侧栏的创建、排序、失败提示和降级 smoke test

## 演进路线

### 阶段一：机制完整性

- 集中成员引用唯一性校验
- pending marker 改为临时文件加原子 rename
- 增加残留 marker、失效描述和残留链接的 doctor/reconcile
- 补齐真实宿主集成测试

### 阶段二：组织体验

- 为 Member 引入稳定身份，降低路径移动和 UI key 的耦合
- 完善 Space 编辑器、批量成员操作和失效记录处理
- 明确多 Space、重复目录和名称冲突的交互规则

### 阶段三：权限接入

- 定义 Permission Adapter seam
- 在宿主沙箱支持时，把成员集合转换为请求期额外根目录
- 明确只读、可写和需要用户批准的能力矩阵
- 保证权限变化不修改 Workspace ID、会话归属或组织顺序

### 阶段四：跨宿主与迁移

- 设计导入/导出格式
- 支持配置迁移和版本化
- 处理多进程并发、外部修改和跨平台路径差异
