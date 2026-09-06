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
- 成员完整路径始终优先匹配；显式显示名不得与其他成员的显示名或目录简称冲突，同名目录使用完整路径消歧
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

核心的 `resolveByPath` 要求目录存在。创建前查询遇到 `ENOENT` 时继续核对核心列表，避免接管目录暂时缺失的普通 Workspace；其他查询错误继续上抛。

pending marker 先写入同目录临时文件并同步文件内容，再原子发布。首次发布不覆盖已有凭据，进度更新使用 rename 替换；发布失败时保留上一份完整凭据。

### 其他操作

所有设置写操作在单个插件实例内串行执行；每个操作真正开始时重新读取设置。成员链接只在与当前描述完全匹配时删除，避免触碰用户手工创建的文件或链接。

成员编辑通过 `save-members` 提交完整草稿及 `expectedRevision`。版本由当前成员内容计算，不另存版本计数；在操作队列中比对，避免旧表单覆盖命令、工具或其他页面的修改。新增目录先 canonicalize，整份草稿校验通过后创建新增链接，再一次保存设置；失败只清理本次新建链接。保存成功后清理被移除成员的匹配链接。已有成员目录离线不妨碍维护其说明或移除描述。

多成员创建复用同一校验与 pending 流程，不在客户端串行拼装多个 attach 操作。原有单成员命令和工具入口仍由相同业务编排处理。

### 客户端边界

模式控制器独立于侧栏组件：在官方模式撤销增强注册和专属样式；在空间模式装载它们。底部切换器为独立的 list 插槽贡献，不包裹或重写官方工作区组件。偏好仅为浏览器展示状态，不进入插件领域设置。

成员草稿、菜单和弹窗各自拥有临时交互状态；核心 Workspace 与 Session 仍来自宿主可订阅快照，插件 registry 仅叠加描述。折叠和显示模式可以本地记忆，工作区和会话顺序只能调用官方排序接口。

## 失效与降级

- 插件 HTTP 接口不可用：客户端展示核心 Workspace 的普通投影
- Space/Chat 描述找不到核心行：保留为 invalid record，不自动修复
- 核心 Workspace 目录暂时缺失：保留核心记录，不由插件删除
- 插件停用：官方 Workspace 和会话继续由宿主管理
- 设置写入失败：保留 pending marker，下一次创建操作执行确定性恢复

客户端在页面可见时每轮请求结束后间隔 3 秒重新读取附加描述，重新聚焦或显示页面时立即读取。侧栏写操作成功后立即刷新；命令、工具和其他页面的修改通过下一轮读取汇合。请求超时或失败时清除旧描述，恢复后重新叠加；隐藏页面暂停轮询，卸载取消请求与监听器。

## 测试策略

自动化测试覆盖：

- 路径规则、成员引用、设置校验、成员链接及创建失败恢复
- pending marker 原子发布、失败保留和临时文件清理
- 核心列表投影、会话分组、排序、搜索及附加描述刷新
- HTTP 参数和分块 UTF-8 请求体边界
- 官方 WorkspaceRegistry、SettingsProvider 与 Cordis 装载、重启、卸载和重新装载
- HTTP、命令、模型工具和提示词对同一核心身份与会话归属的使用

集成测试只替换持久化介质与宿主入口收集器，不重写 Workspace 和 Settings 的行为。浏览器验收使用隔离的 `DSH_HOME` 和托管目录，不操作真实用户数据；每轮交互修改后复测创建、成员编辑、排序、错误反馈与降级。

## 演进路线

本期按 [交互设计与验收](ui.md) 完成上线交互与官方模式还原；交互测试发现的机制缺口先补规则与回归测试，再继续 UI。

失效记录诊断、配置版本化、导入导出和跨进程协作按实际使用需求单独立项，不自动修复或猜测数据归属。多根权限不属于本期规划，未来接入时只能消费组织关系，不能改变 Workspace ID、会话归属或组织顺序。

每阶段结束时复核验收范围、错误分支、测试和文档，删除临时诊断、重复说明与已失效方案，只保留当前正向流程及明确的后续范围。
