# dsh-space

DSH 多项目空间插件。两条创建路径、两类实体：

- **工作区（space）**：建立 = 建壳目录。工作区**允许多目录**——壳为物理入口，成员文件夹以 **reference（原地引用，默认）** 或 **link（壳内 symlink，显式选择）** 挂入，作为提示词语义上的扩展
- **对话（chat）**：建立 = **静默**在 `chats/<本地日期>/` 下建目录。静默指位置自动确定（用户不选地方），不是不留痕

```text
~/Documents/dsh/                  ← 托管根（settings 里可改）
├── spaces/<空间名>/              ← 工作区壳目录（创建即建）
│   ├── projects/<成员>           ← link 成员的 symlink
│   └── docs/ notes/ …            ← 空间级资产展开点
└── chats/<本地日期>/<slug>/       ← 对话目录（/space chat，重名加 -2 序号）
```

## 注册表与绑定

- 注册表存于 dsh settings（`dsh-space` 命名空间），两类实体：`spaces`（id/名称/壳/主成员/成员列表/绑定）与 `chats`（路径/绑定）
- **id-first 纪律**：两条创建路径都在创建动作里把目录幂等登记（create-or-get）为核心工作区行并持有 `workspaceId` 绑定；凡接触核心工作区一律先 id 后 path
- `workspace.path` 只是经 id 查出的派生属性，仅用于一致性校验与悬空恢复——为上游未来把 `path` 演进为 `paths[]`（deepseek-harness #991）预留最小爆炸半径
- 除此之外对核心注册表一律只读
- **红线：sessionId 零持久化**——不存会话引用；哪个会话属于哪个工作区/对话由绑定行上的核心账目（`sessionIds`）承载

## 有效路径与入口

```
有效路径 = 壳目录 ?? 主成员 ?? 首位成员
```

- **壳是唯一正典 cwd 入口**：工作区的新会话从壳目录创建；无壳空间用主成员兜底（无壳形态的正向表达），连主成员也没有则无入口
- **成员是纯注解**：link/ref 成员只是提示词语义（告知 agent 本工作语境），不是匹配面、不是会话入口；cwd 在成员目录里的会话不属于任何工作区
- 匹配（认领存量会话）与入口（产生新会话）是分离规则：识别宽松（有效路径子树包含即认领）、入口严格
- `primary` 是纯字段标记，不联动排序——「primary 排首位」只是前端当前的展示倾向

## 异常谱系（doctor 只读检测，不治愈）

| 异常 | 判定 |
| --- | --- |
| A 悬空 | 绑定 id 查无此行（核心侧行被删除——正常表现） |
| B 错位 | 行在，但 `行.path ≠ 有效路径`（数据质量问题，只报告） |
| C 缺失 | 无绑定（被动渲染不建行，实际操作时再登记） |
| D 壳消失 | 壳目录磁盘不存在（注册表结构仍在，link 可推导重建） |
| E 共享行/路径 | 两空间绑同一行或有效路径相同 |
| F 成员异常 | 目录缺失 / link 断裂（doctor 既有职责） |

对话实体的健康同样只读检测：目录消失 / 未绑定 / 绑定悬空。

## 能力

- **模型工具 `space`**：`list` / `create` / `attach` / `detach` / `primary` / `title` / `desc` / `doctor` / `chat` / `chatdrop` / `drop`
- **用户命令 `/space`**：同上子命令 + `status`
- **上下文注入**：cwd 落在空间的有效路径子树内时，系统上下文自动附带空间地图（入口目录 + 成员 + 沙盒约束提示）
- **客户端侧边栏**：接管官方 `sidebar.workspaces` 区域（single 插槽顶替，卸载即还原）——
  工作区卡片（名称/绑定徽标/折叠记忆/成员区/设主/摘除/拖拽排序）+ 对话区（chats 按日期分组）+ 未归组杂项；
  会话行三态状态点（等待交互/运行中/完成未读），点击跳转；内联创建表单（工作区带原生目录选择器与 ref/link 切换，对话建目录即开会话）
- **逃生门**：`localStorage['dsh-space.sidebar.off'] = '1'` 后刷新即还原官方侧边栏，清除该键恢复
- **浏览器侧 HTTP API**（web profile；客户端侧边栏的数据面）：
  - `GET /api/dsh-space/registry` → `{root, spaces（含预算 effectivePath）, chats}`
  - `POST /api/dsh-space/resolve` `{paths: string[]}` → 批量 cwd 认领（canonicalize + 子树包含，宽松识别）
  - `POST /api/dsh-space/ops` `{op, …}` → `create-space | attach | detach | primary | chat | chatdrop | drop | rebind | reorder-spaces`，与工具/命令共用域函数；`rebind` 为按需治愈（悬空重建绑定），`reorder-spaces` 为拖拽排序落库

## 读写语义

- 读取不限成员边界（dsh 沙盒不限制读）
- 会话 cwd 固定在入口目录；`workspace-write` 下仅 cwd 子树可写，写其他成员会被风控拦截（预期行为，解法后置）；`danger-full-access` 全开
- `doctor` 逐成员报告可写性、link 健康度、目录缺失，外加工作区绑定审计与对话实体健康

## 规则

- 同一文件夹可属于多个空间（跨空间多重归属；有效路径子树重叠时命中全部地图）
- 显示名（title）是成员的身份键之一，同一空间内不得撞车
- `detach` 连带删除壳内 symlink（插件自建产物），真实目录不动；`drop` / `chatdrop` 只删注册表记录，磁盘目录由用户手工清理

## 安装

```bash
# 在本仓库内构建后：
dsh plugin --profile web add link:<本仓库路径>/packages/space
```

安装会把包加入 profile 的 `dsh.profile.bundles`（本包声明了 `dsh.bundle.patch`），重启 dsh 后生效。

## 边界

- 不 patch、不包装任何核心服务；官方未来若提供多文件夹工作区（deepseek-harness #991），本插件的实体模型与之同构，可平移
- 会话 cwd 经 symlink 进入成员目录时按 realpath 归属——realpath 出壳即不命中，与「成员不是入口」的模型一致
- 「用户在核心 UI 删除工作区行」不触发本插件任何响应：绑定悬空由 doctor 如实报告，治愈措施遇到再议
