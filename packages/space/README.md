# dsh-space

DSH 多项目空间插件：以「壳工作空间」组织多个项目仓库——壳根承载 `space.yaml` 与文档约定，成员项目挂在 `projects/` 下、git 各自独立。

## 能力

- **磁盘载体**：`space.yaml` 描述空间名与成员项目（路径/标题/一句话说明），纯数据文件，任何工具可读写
- **模型工具 `space`**：`list` / `init` / `mount` / `unmount` / `setdesc` / `doctor`
- **用户命令 `/space`**：`status` / `init` / `mount` / `unmount` / `desc` / `doctor` / `list-known`
- **上下文注入**：会话 cwd 落在空间内时，系统上下文自动附带空间地图（成员清单 + 说明）
- **自动登记**：壳根与成员项目自动注册为 dsh workspace 并保持排序相邻（可用 `config.registerWorkspaces: false` 关闭）

## 挂载方式与沙盒

- git URL → clone 到 `projects/<name>`（壳内真实子目录，`workspace-write` 下可写）
- 本机目录 → symlink 到 `projects/<name>`（真实路径在壳外；`workspace-write` 模式下写入会被沙盒按 realpath 拒绝，`danger-full-access` 不受影响）

`doctor` 动作会按当前会话的沙盒模式逐项目如实报告可写性。

## 安装

```bash
# 在本仓库内构建后：
dsh plugin --profile web add link:<本仓库路径>/packages/space
```

安装会把包加入 profile 的 `dsh.profile.bundles`（本包声明了 `dsh.bundle.patch`），重启 dsh 后生效。

## 边界

- 不 patch、不包装任何核心服务；官方未来若提供多根能力，本插件的领域层（space.yaml、空间地图、工作流）不受影响
- `unmount` 只改 `space.yaml`，绝不删除磁盘文件
- 会话 cwd 经由 symlink 进入壳外项目时，空间检测以 realpath 为准（壳外项目内不注入空间地图）
