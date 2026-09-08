# DSH 会话永久删除能力调查

> 状态：宿主删除能力的只读研究；本文不记录后续独立授权的离线维护，未修改宿主实现。
>
> 调查日期：2026-09-09。主基线为官方发布包 `0.1.1-rc.2`；最新上游的抽查单列，不混用两版接口。本文不包含真实会话 ID、标题、消息内容、删除名单或个人安装路径。

## 1. 结论

当前版本不是只有 UI 缺少“删除”按钮。它缺少从停止接收新工作、释放运行态、等待持久化完成，到删除日志、清理派生状态并通知所有客户端的一整套永久删除契约。

- **已支持**：移除工作区登记、归档会话、取消正在进行的活动、等待 Agent 空闲，以及由生命周期所有者释放其持有的 Agent。
- **未支持**：通过现有稳定 Context 服务，按任意既有 Session ID 完整、安全地在线永久删除会话。
- **可以扩展实现**：在宿主增加删除协调器及持久化后端删除能力；插件负责入口、确认和展示，调用宿主能力。
- **离线维护可行**：停用所有共享数据根的写入实例后，按审定清单清理文件和关联记录。这是受控维护，不是当前产品已经提供的删除功能，也不等同于磁盘介质的不可恢复擦除。

上述判断以接口声明、实际实现及一个隔离后端实验为依据，而不是仅凭界面未显示入口。[E1][E2][E3][E4]

## 2. 三种操作不能互相替代

| 操作 | 当前效果 | 不会发生的事 |
| --- | --- | --- |
| 移除工作区登记 | 删除 Workspace 记录和展示顺序中的对应 ID；插件另清自身附加描述 | 不删除工作目录，不删除会话日志，不清全局归档集合 |
| 归档会话 | 向注册表全局 `archivedSessionIds` 加入 Session ID | 不释放 Agent，不删除日志和附件，不取消所有后台工作 |
| 永久删除会话 | 当前没有端到端公共操作 | 不能把 `cancel`、`detach`、`dispose`、删除 SQLite 索引或删除 cwd 当成等价操作 |

`archiveSession` 验证会话存在于 live 或 persistence，而不是要求仍归属某个 Workspace。因此“先移除工作区登记，再归档关联会话”在接口层可行，但必须在第一步之前保存精确的会话 ID 名单；不能移除之后再仅靠 Workspace 列表反推。[E1][E5]

工作目录和日志目录是两套存储：托管 Chat 的 cwd 位于插件托管目录，JSONL 会话日志由宿主保存到其独立 Session 根。删除前者并不会从后者移除会话。[E4][E5]

## 3. 运行态：已有释放能力，但没有任意 ID 的删除入口

### 3.1 `cancel`、`whenIdle` 和维护任务

公共 `Agent` 提供：

- `cancel(cause, options)`：清理或保留 inbox，并取消当前活动
- `whenIdle()`：等待当前驱动和维护任务静默
- `runMaintenance(task)`：从真正空闲阶段启动维护任务，将稍后到来的唤醒工作暂存在 inbox

Host 的 `session.cancel` 调用 `agent.cancel({ kind: 'user' }, { keepInbox: true })`，随后立即返回 `accepted: true`。这个响应既不表示活动已经结束，也不表示队列已经清空。`whenIdle()` 是等待能力，不是持续禁止新请求进入的锁；维护任务完成后，暂存的输入仍可继续工作。[E6][E7]

因此，`cancel → whenIdle → unlink` 不是安全在线删除算法。它没有同时关闭来自其他页面、其他 Host 入口、目标驱动器、子代理或持有 Agent 引用的插件的新工作入口。

提醒和后台 Job 也不是靠删日志停止：`schedule_delete` 追加停用事件并 flush，仍保留旧提醒文本；运行时 dispose 才停止相关定时器并等待工作。Job 有取消接口，所有者释放会等待所属 Job 收束。这些能力应纳入生命周期排空，而非当作永久擦除接口。[E19]

### 3.2 `AgentHandle.dispose()` 的所有权边界

`AgentRegistry.create/resume` 返回 `AgentHandle`，其中的 `dispose()` 是创建者持有的生命周期能力。`ctx.agents.get(id)` 只返回裸 `Agent`，不返回句柄；注册表没有公共 `dispose(id)` 或 `delete(id)`。[E2]

实际 Agent Factory 的释放链会：

1. 取消本生命周期
2. 等待 `machine.whenIdle()`
3. 释放 scoped world
4. 调用之前保存的 Agent 和 Session detach 闭包
5. 从 Factory 所有权跟踪中移除

这些是现成可复用的内部构件，但释放最终仍由持有句柄的所有者协调。Host 的 `ensureSession` 在创建或恢复后返回 `handle.agent`，并未对普通插件公开这个既有会话的 `dispose` 句柄。[E8][E9]

### 3.3 `SessionStore` 的 detach 不删除持久化数据

`SessionStore.enter(session)` 返回本次入表对应的 detach 闭包。它移除内存 map 和发布钩子，并发出 `session/disposed`；不能重新 `enter` 一个已有 ID 来取得它的旧闭包，重复身份会拒绝。`detachEntered` 是私有实现。[E3]

此外，`session/disposed` 是同步生命周期通知，**不是“全部存储写入已经完成”的确认**。JSONL 协调器和投影缓存在该事件之后仍会异步保存最后状态，详见下一节。[E10][E11]

## 4. 持久化：缺少删除、按 ID 排空和失效契约

### 4.1 公共接口与内部状态

`SessionPersistence` 提供 `create`、`append`、`prepare`、`load`、`inspect`、`readFrom`、`list`、`listSnapshots`、`locate` 和可选原始日志读取，不提供永久删除方法。`locate()` 的注释明确要求将其视为位置提示，而不是操作授权。[E4]

`PersistenceCoordinator` 私有维护：

- 每个 ID 的持久化游标和 materialized 状态
- 每个 live Session 的写后缓冲
- 每个 ID 的串行 Promise 链
- 待完成的 retirement
- 冷读取缓存、准备态和 resume reservation

现有 `serialize` 能保证协调器内部同一 ID 的读写排序，但外部文件删除不在这条链上。协调器没有公共 `delete`、`drain(id)`、`invalidate(id)` 或删除期间的拒绝写入状态。[E10]

### 4.2 `dispose` 后仍会保存

`session/disposed` 调用 `retire(session)`，后者启动异步 `retireCore`：先 `flush`，再经过同一 ID 的串行链释放 live/state。事件监听器没有向外返回可等待的 retirement Promise；内部另用私有 `retirements` 跟踪。[E10]

投影缓存也在 `session/disposed` 调用 `flushSoft/write`，并可能已有计数阈值、定时器、`turn/end` 引发的 checkpoint。它不会仅因真实日志被删就自动删除旧缓存行。[E11]

因此，顺序若是“先删日志或缓存，再 dispose”，可能发生回写；只等 Agent 空闲，也不等价于后端所有写后工作均已完成。

### 4.3 已实测：残留写入可重建无头日志

本次使用系统临时目录的 `mkdtemp` 创建隔离 fixture，直接调用发布包中真实 `JsonlSessionPersistence` 后端方法。没有启动 Host，没有使用真实 `DSH_HOME`，没有读取会话消息或凭据。临时目录已在 `finally` 中清除。

实验步骤：

1. 使用 `compression: 'zstd'`、虚构 Session Header 和 `session/title` 事件，调用 `appendBatch(meta, [seq0], false)` 物化正常日志
2. 确认 `list()` 返回 1 条记录
3. 仅 `unlink` 这份临时日志，保留它的父目录
4. 模拟已物化 writer 的后续工作，调用 `appendBatch(meta, [seq1], true)`
5. 读取新文件的首个解压帧并再次列表

实际结果：

```json
{
  "beforeListed": 1,
  "afterListed": 0,
  "recreatedFirstType": "session/title",
  "recreatedFirstSeq": 1,
  "recreatedHeaderMissing": true
}
```

原因是已物化路径进入 `appendLines`，其中 `open(path, 'a')` 在文件缺失而父目录仍存在时会创建文件，但只写事件批次，不补 Session Header。无有效 Header 的文件会被列表跳过。这里的风险不是简单的“会话又显示回来”，而是**磁盘上产生列表看不到的不合法日志**。[E12]

另一条源码可见的风险是持久化插件重载：安装监听时会重新观察所有 live Session；若日志不存在，`onCreated` 会将 live seed 作为新日志重新物化。[E10]

实验边界：这是后端断点级复现，通过原型构造隔离后端接收者，只调用后端文件方法，未建立 Cordis 服务和完整 Host。它验证残留 writer 的文件行为，不验证所有并发请求的时序，也不是在线删除实现或整体验收。

## 5. 删除日志之外还要处理什么

### 5.1 工作区归属和归档集合

Workspace 的 `sessionIds` 与注册表全局 `archivedSessionIds` 是独立关系。移除 Workspace 特意保留后者；归档接口只有加入操作。无效归属投影可能不再显示，但不代表底层引用已经持久清除。[E5]

完整删除需要 Workspace 所有者提供按明确 Session ID 移除归属、归档标记和内部路径缓存的能力，并保持其他工作区顺序不变。直接经低层 Storage Domain 修改记录会绕过拥有该域的服务内存状态；不是完整的生命周期方案。`storageDomain.open` 也不是可反复重开并抢占现有域的共享写接口。[E13]

### 5.2 投影缓存

`session_projcache` 是可重建的派生缓存，不是 Session 事实源。缓存记录必须与真实 Header 的身份匹配；冷读取仍需读真实日志，不能仅凭缓存恢复缺失日志。但是当前没有自动 prune、显式 delete 或统一失效接口，所以物理删除后仍可能残留摘要、状态等缓存数据。[E11]

需要在阻止写入并排空之后精确清除对应记录；不应为了几个 Session 丢弃所有保留会话的缓存。

### 5.3 搜索索引

SQLite 搜索在每次 `searchSessions/searchEvents` 前 reconcile，不是定时清理。有效 persistence 服务存在、双次快照稳定时，它会删除源日志已不存在的 `persisted_sessions` 和 `persisted_docs`；仍 live 的会话还会进入 `temp.live_*`。没有 persistence 服务时，不把空观察错误地解释成“全部已删除”。[E14]

这意味着：

- 无需盲删整个搜索数据库
- 只删索引不能删除会话，源日志或 live 状态会重建索引
- 对端到端删除需要显式完成索引失效或核验，不能把“等下一次用户搜索”当作立即清理完成
- SQLite 逻辑 `DELETE` 不承诺原始内容从数据库空闲页、WAL、备份或系统快照中不可恢复

### 5.4 附件与继承内容

图片对象按内容 hash 存放于全局 `attachments/v1/objects`，request-image 派生缓存也全局存在。官方附件包文档明确暂缓 retention/GC，原因包含 resume/fork 对不可变对象的共享。[E15]

不能因删除一个 Workspace 或 Session 就删除其曾用图片；必须统计所有保留日志、保留分叉以及可见客户端草稿的引用。当前服务没有按 Session 自动回收附件的公共能力。

Fork 的 seed 是父事件切片的副本，而非仅保存父日志路径。因此删除父日志不必然阻止子会话重放；反过来，删除父日志也不代表其历史内容已从保留分叉中消失。父链和子代理树仍需要检查，不能擅自级联删除保留会话或改写保留日志中的 lineage。[E16]

同理，Session Reference 会把被引用会话的表面内容渲染为新的上下文消息；删除源会话不会撤回已经写入其他保留会话的快照。会话删除不能承诺消除所有复制内容。[E20]

### 5.5 客户端和插件展示引用

现有 `host/session-removed` 来自 live Session 的 dispose，不是永久删除事件。客户端对它有保留当前舞台、子代理地址及部分摘要状态的路径；刷新列表也不等于清除所有浏览器的缓存和草稿。[E17]

在线产品能力至少需要明确的永久删除结果或事件，使当前会话、其他标签页、断线重连页停止对该 ID 发送请求，解除选择，并清理对应 scoped stores。文字草稿、当前选中 ID、插件置顶、分组分配、排序引用分属不同 localStorage 状态，不能删除所有分组或其他会话的偏好。服务器无法直接清除已离线浏览器中所有历史 origin 的数据。[E18]

## 6. 最小扩展边界

以下是设计建议，不是已存在的 API，也不是本次已实施的修改。

| 位置 | 最小新增能力 | 为何不能只加按钮 |
| --- | --- | --- |
| 宿主 Session 管理层 | 删除计划、身份核验、按 ID 的进入禁令，协调生命周期所有者，返回分阶段结果 | 需要同时阻止 create/resume/fork/prompt 以及其他服务入口的竞争 |
| Agent 生命周期所有者 | 由授权协调器按身份释放现有句柄，并等待停止、scope teardown、detach 完成 | 普通插件只能拿到裸 Agent，不能借 `get(id)` 获得旧句柄 |
| Session 持久化契约 | 删除方法与身份/版本前置条件；排空该 ID 的写入、retirement、preparation 后删除后端 artifact | 外部 unlink 不参加内部串行链，且会产生已验证的回写风险 |
| JSONL 后端 | 精确删除所属 artifact，保护路径与编码边界，必要时清空 Session 专属目录 | 不能按 Workspace cwd 推测宿主日志布局，也不能删除共享父目录 |
| Workspace / Cache / Search 所有者 | 按明确已删除 ID 清理引用和派生数据，操作可重试 | 列表过滤、归档、dispose 不是这些数据的清除契约 |
| RPC / SSE / Client Runtime | 删除请求、明确错误码和终态，永久失效通知及重连核验 | 当前 removed 事件只是退出 live；旧客户端仍可能发出显式 ID 创建 |
| 插件 | 选择范围、风险预览、确认、结果展示、精确清理自己的布局引用 | 不应越过宿主所有者，自己组装私有 map 和磁盘路径修改 |

若需要抵抗进程崩溃后的重试和旧客户端显式 ID 重建，必须另定持久删除标记或等价的删除作业协议。当前 Host 在显式 ID 不存在于 live/persistence 时允许创建，甚至递归确保 cwd 存在；删除只有文件系统步骤而没有身份禁令，会留下重新创建窗口。[E9]

推荐的完整顺序是：

1. 生成并确认精确计划，区分 Session、Workspace、cwd、附件四类对象，检查跨范围父链和共享引用
2. 在所有入口阻止目标 ID 的新工作，并使并发已入场操作完成或退出
3. 由真实生命周期所有者取消、等待并释放目标及明确纳入的子代理
4. 等待最后 flush、retirement、缓存 checkpoint 和准备态处理完毕
5. 删除日志事实源，精确清理归属、归档、缓存、搜索和插件引用
6. 单独按目录归属与共享检查结果处理 cwd；附件按独立引用策略处理
7. 广播永久失效，核验重启、重连后不再列出、不再恢复、不产生残留写入；失败可幂等重试

可以通过新增或替换宿主服务实现这些能力，技术上并非不可行。但以插件 monkey patch 私有方法、跨服务直接改 JSON、伪造 `session/disposed` 或只调用文件系统删除，都不能称为使用现有稳定接口完成可靠在线删除。

## 7. 上游固定版本抽查

另对官方仓库固定提交 `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` 进行了接口抽查。该提交结构已经与本机发布包不同，结论只用于判断有没有可直接采用的公开删除入口，不将其行号或结构套回 `0.1.1-rc.2`。

- [上游 Session Persistence](https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/session/session-persistence/src/index.ts#L135)：公开 create/open/flush/stat/list 等能力，未发现永久 delete
- [上游 Session Controller](https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/api/session-controller/src/index.ts)：本次接口抽查未发现公开永久删除操作
- [上游 Session Store](https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/core/session/src/index.ts)：enter/detach 是内存生命周期，不等同于永久删除

这不是对所有分支或未来发布的保证，也不能据此承诺升级某个 npm tag 就能解决。本次没有升级宿主。

## 8. 后续实现必须覆盖的验证

- 冷会话、已加载空闲会话、运行中会话、归档会话、未落盘空白会话、分叉和子代理分别验证
- 删除与 resume、append、缓存定时器、dispose 后写入竞争，不重建日志、不遗留无头 artifact
- 区分 persistence 不可用、读取失败和真实 not-found，不把故障当成已删除
- 删除过程和搜索双快照竞争不误删未选择会话，旧搜索 cursor 正确失效
- Workspace 归属、全局归档集合和路径缓存一致清理，不改变其他 owner 的顺序
- 当前舞台、另一个标签页、断线重连和子代理地址正确失效，旧 ID 无法偷偷重新创建
- 仅清除目标 ID 的 scoped stores、pins、assignments、orders，不删除其他草稿和分组定义
- 共享 cwd、symlink、附件、fork 继承内容和跨范围父链分别检查，不按目录名或标题推断归属
- 每个阶段失败都可安全重试；部分完成不得返回全成功，重启后必须可核对最终状态

## 9. 发布包证据索引

以下路径相对于对应 npm 包根目录，版本统一为 `0.1.1-rc.2`。行号来自实际发布的 JS 或声明文件，不是推测的 TypeScript 源码行号。采用包名定位是为了避免研究文档依赖个人安装前缀；不同打包版本应重新核对。

| 证据 | 包与文件定位 | 核实内容 |
| --- | --- | --- |
| E1 | `@deepseek-ai/dsh-host-apiproxy`，`lib/types/api/rpc-map.d.ts:22`、`lib/types/fetch/handler.js:22` | Session RPC 和实际 HTTP 注册表；有 workspace.delete/archiveSession，无 Session 永久删除 |
| E2 | `@deepseek-ai/dsh-agent`，`lib/types/index.d.ts:142`、`:280`、`:344` | AgentHandle 所有权；create/resume 和 bare get |
| E3 | `@deepseek-ai/dsh-session`，`lib/types/index.d.ts:336`、`lib/index.js:1693`、`:1726` | enter 返回 detach 闭包；只删除内存 entry 和发 disposed |
| E4 | `@deepseek-ai/dsh-session-persistence`，`lib/types/index.d.ts:60` | 持久化公共契约和 locate 的位置提示边界 |
| E5 | `@deepseek-ai/dsh-workspace`，`lib/index.js:78`、`:154`、`:415`、`:518` | 有效归属投影、归档验证、删除工作区保留归档集合 |
| E6 | `@deepseek-ai/dsh-agent`，`lib/types/runtime-types.d.ts:60` | cancel、whenIdle、runMaintenance、后续唤醒语义 |
| E7 | `@deepseek-ai/dsh-host-apiproxy`，`lib/types/api-proxy.js:2239` | session.cancel 保留 inbox，仅返回 accepted |
| E8 | `@deepseek-ai/dsh-agent-loop`，`lib/index.js:1128` | Factory 所有者的停止、等待、scope 释放、detach 链 |
| E9 | `@deepseek-ai/dsh-host-apiproxy`，`lib/types/api-proxy.js:1303`、`:1788` | 显式 ID create/resume、缺失 cwd 的创建，以及只返回 handle.agent |
| E10 | `@deepseek-ai/dsh-session-persistence`，`lib/types/coordinator.d.ts:189`、`lib/index.js:829`、`:1132`、`:1165`、`:1249` | 串行链、写后缓冲、异步 retirement、缺失日志时重放 live seed |
| E11 | `@deepseek-ai/dsh-session-projection-cache`，`lib/index.js:62`、`:123`、`:159`、`:177`、`:219` | 派生域、身份校验、真实日志冷读取、disposed 后 checkpoint，无 prune 接口 |
| E12 | `@deepseek-ai/dsh-session-persistence-jsonl`，`lib/index.js:1021`、`:1060`、`:1097`、`:1199` | 实际 appendBatch/materialize/list 与 open(path, 'a') 回写路径 |
| E13 | `@deepseek-ai/dsh-storage-domain`，`lib/types/index.d.ts:65`、`:82`、`lib/index.js:341` | 已打开域的拥有权约束；get 用于诊断，不是服务间一致性协调器 |
| E14 | `@deepseek-ai/dsh-session-query-sqlite`，`lib/index.js:535`、`:644`、`:705`、`:757` | 每次查询前 reconcile、稳定观察、成对删除索引行 |
| E15 | `@deepseek-ai/dsh-attachment`，`README.md:22`；`@deepseek-ai/dsh-attachment-local`，`README.md:23`、`lib/index.js:304`、`:653`、`:831` | 全局内容寻址对象、派生缓存、retention/GC 暂缓 |
| E16 | `@deepseek-ai/dsh-session`，`lib/index.js:1844`；`@deepseek-ai/dsh-subagent`，`lib/index.js:1823` | Fork 复制 seed；子代理按父链构建树 |
| E17 | `@deepseek-ai/dsh-host-apiproxy`，`lib/index.js:3624`；`@deepseek-ai/dsh-client-runtime`，`lib/client.js:7548`、`:8071`、`:8377`、`:9285` | live removed 与永久删除的区别；当前舞台及客户端缓存保留路径 |
| E18 | `@deepseek-ai/dsh-client-ui-conversation`，`lib/client.js:22`、`:58`、`:143`；`@deepseek-ai/dsh-client-runtime`，`lib/client.js:168`、`:5476`、`:8899`；本仓库 `packages/space/src/client/layout.ts:60`、`:315` | 文本草稿、内存图片、scoped store、选择和插件布局引用 |
| E19 | `@deepseek-ai/dsh-schedule`，`lib/index.js:397`、`:710`、`:1274`；`@deepseek-ai/dsh-jobs`，`lib/types/index.d.ts:83`；`@deepseek-ai/dsh-jobs-local`，`lib/index.js:406` | 提醒停用事件与定时器释放、Job 取消和所有者释放 |
| E20 | `@deepseek-ai/dsh-session-reference`，`lib/index.js:461` | 被引用会话的内容作为快照写入另一会话，删除源会话不会撤回 |
