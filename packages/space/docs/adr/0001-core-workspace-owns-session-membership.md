# 核心 Workspace 拥有会话归属

## 状态

已采用

## 决策

`dsh-space` 不再保存或推断会话归属。官方 `workspaceRegistry` 的 Workspace ID、canonical path、稳定列表顺序和 `sessionIds` 是唯一权威。

插件设置只保存以下附加信息：成员目录及其模式、成员显示名和说明、主成员标记，以及 Space/Chat 类型。

## 原因

按 cwd 推断归属会把“切换主目录”误认为“切换 Workspace”，并在会话历史中制造未归组。双注册表同时保存顺序和绑定也会产生漂移，迫使实现加入大量迁移和自动修复分支。

## 后果

- 修改 `primary` 是纯展示元数据操作
- 核心 Workspace 仍可由官方界面改名、排序、归档会话和管理普通 Workspace
- 插件停用或删除附加描述后，数据自然退化为官方 Workspace
- 核心行缺失只报告失效描述，不根据路径猜测新 ID
- 新建 Space/Chat 必须先创建固定目录并登记核心 Workspace，再写插件描述
