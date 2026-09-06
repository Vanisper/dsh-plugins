# dsh-space 文档

## 入口

- [插件说明](../README.md)：用户可见能力、边界和宿主接口
- [实现设计](design.md)：领域模型、运行链路、模块职责和演进路线
- [交互设计与验收](ui.md)：以插件场景为主的交互契约与阶段门禁
- [上线验收记录](acceptance.md)：验证环境、已验证链路和发布边界
- [上下文](../CONTEXT.md)：稳定术语、唯一事实源和降级规则

## 决策

- [0001 核心 Workspace 拥有会话归属](adr/0001-core-workspace-owns-session-membership.md)
- [0002 先建立组织层，再接入权限层](adr/0002-organization-before-permission.md)

## 调研

- [会话级多目录机制](research/multi-root-session-level.md)
- [编辑器侧多根工作区](research/multi-root-editor-level.md)
