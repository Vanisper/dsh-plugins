# dsh-space

DSH 多项目空间插件：把若干磁盘文件夹组合为一个命名空间——空间是命名实体，文件夹**原地引用**（不移动、不复制、不做 symlink），创建空间与挂入文件夹是分离的操作。

## 能力

- **实体模型**：`空间 = 名称 + 成员文件夹列表 + 主成员`；状态存于 dsh settings（`dsh-space` 命名空间）
- **模型工具 `space`**：`list` / `create` / `attach` / `detach` / `primary` / `title` / `desc` / `doctor`
- **用户命令 `/space`**：`status` / `create` / `attach` / `detach` / `primary` / `title` / `desc` / `doctor`
- **上下文注入**：会话 cwd 落在任一成员文件夹内时，系统上下文自动附带空间地图（成员清单 + 说明 + 主成员）
- **自动登记**：成员文件夹自动注册为 dsh workspace（主成员在前、相邻成组；可用 `config.registerWorkspaces: false` 关闭）

## 读写语义

- 读取不限成员边界（dsh 沙盒本来就不限制读）
- 写入跟随会话 cwd 所在成员（`workspace-write` 沙盒语义；`danger-full-access` 下全开）
- `doctor` 逐成员如实报告：可写 / 仅 cwd 子树可写 / 只读 / 目录缺失

## 规则

- 一个文件夹全局只能属于一个空间（按 realpath 判定）
- 显示名（title）是成员的身份键之一，同一空间内不得撞车
- `detach` 只解除关联，绝不删除磁盘文件

## 安装

```bash
# 在本仓库内构建后：
dsh plugin --profile web add link:<本仓库路径>/packages/space
```

安装会把包加入 profile 的 `dsh.profile.bundles`（本包声明了 `dsh.bundle.patch`），重启 dsh 后生效。

## 边界

- 不 patch、不包装任何核心服务；官方未来若提供多文件夹工作区（deepseek-harness #991），本插件的实体模型与之同构，可平移
- 会话 cwd 经 symlink 进入成员目录时按 realpath 归属（与该成员的登记身份一致）
