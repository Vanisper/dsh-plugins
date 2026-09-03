# dsh-space 上下文

## 唯一事实源

运行时模型是：

```text
workspaceId -> canonical directory -> ordered sessionIds
```

`dsh-space` 的设置是核心注册表的附加描述，不是第二套 Workspace 注册表。任何根据当前 cwd、成员路径包含关系或 `primary` 推导会话归属的实现都违反当前模型。

## 投影规则

核心列表中的每一行恰好投影为一个项目：没有描述是 `plain`，有 Space 描述是 `space`，有 Chat 描述是 `chat`。附加描述找不到核心行时作为失效记录展示，不自动修复或迁移。

## 降级规则

移除 Space 或 Chat 描述只修改插件设置，保留核心 Workspace、目录和会话。插件卸载不会清理或重排官方 Workspace 数据。

## 分层

- `src/business/`：业务规则与操作编排
- `src/store/`：设置适配器
- `src/workspace/`：核心 Workspace 适配器
- `src/host/`：HTTP、命令、工具和提示词
- `src/client/`：侧栏投影和客户端交互
- `src/shared/`：路径、常量和日志
