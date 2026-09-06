# 编辑器侧多根工作区方案对标调研

> 背景：dsh 当前 workspace 模型为「一个 workspace = 一个目录路径，会话仅当 cwd 与该路径精确相等时归属」。本调研为「多项目空间」插件设计提供编辑器侧多根工作区的一手资料对标。
>
> 调研原则：仅引用一手来源（官方文档、官方 GitHub 仓库源码 / release notes / 官方 forum 公告），不使用二手博客。找不到一手来源的点明确标注「未找到一手来源」。

---

## 一、VSCode Multi-root Workspace

### 1. 数据模型

**`.code-workspace` 文件 schema**

- 顶层结构为 JSONC（允许注释），核心字段为 `folders` 数组，每项含 `path`（必填）与 `name`（可选）。`path` 支持绝对或相对路径（相对于 workspace 文件所在位置），官方建议需要共享 workspace 文件时使用相对路径。来源：[Multi-root Workspaces - Workspace file schema](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-file-schema)
- `name` 用于覆盖资源管理器中该根的显示名（默认为目录 basename），便于用「Product」「Documentation」这类语义名区分各根。来源：[同上](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-file-schema)
- 源码层面，存储条目形态为 `{path, name?}` 或 `{uri, name?}`，`getStoredWorkspaceFolder` 优先生成相对路径。来源：[microsoft/vscode — src/vs/platform/workspaces/common/workspaces.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/workspaces/common/workspaces.ts)

**workspace 文件的其他顶层字段**

| 字段 | 语义 | 来源 |
| --- | --- | --- |
| `settings` | workspace 级设置，对所有根生效 | [Multi-root Workspaces - Settings](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_settings) |
| `extensions.recommendations` / `unwantedRecommendations` | workspace 级扩展推荐 / 反推荐（后者文档页未提及，定义在源码 extensions schema 中） | [Extension recommendations](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_extension-recommendations)、[extensionsFileTemplate.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/extensions/common/extensionsFileTemplate.ts) |
| `launch` | workspace 级调试配置节区，含 `configurations` / `compounds` | [Workspace launch configurations](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-launch-configurations) |
| `tasks` | workspace 级任务节区，**只允许 shell / process 类型** | [Workspace task configuration](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-task-configuration) |
| 顶层 `name` | 文档侧**未找到一手来源**（源码 IWorkspace 接口有可选 name 字段） | — |

**设置的分层合并规则**

- 优先级（后者覆盖前者）：Default < User < Remote < Workspace（`.code-workspace` 的 `settings`）< Workspace Folder（各根 `.vscode/settings.json`）< 各级语言特定设置 < Policy。官方原文："Global Workspace settings override User settings and folder settings can override Workspace or User settings."。来源：[Settings precedence](https://code.visualstudio.com/docs/configure/settings#_settings-precedence)、[Multi-root Workspaces - Settings](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_settings)
- 合并语义：原始类型与数组整体覆盖，Object 按键合并。来源：[Settings precedence](https://code.visualstudio.com/docs/configure/settings#_settings-precedence)
- **多根下的关键约束**：各根 folder 的 `.vscode/settings.json` 只应用 resource（文件/文件夹）作用域的设置；影响整个编辑器窗口的设置（如 `window.zoomLevel`、UI 布局）在 folder 级被忽略，并在 Settings 编辑器中置灰显示。源码中 `FOLDER_SCOPES = [RESOURCE, LANGUAGE_OVERRIDABLE, MACHINE_OVERRIDABLE]`（不含 WINDOW）。来源：[Multi-root Workspaces - Settings / Unsupported folder settings](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_settings)、[configuration.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/configuration/common/configuration.ts)
- 安全限制：指定可执行文件路径的设置（如 `terminal.external.windowsExec`）只允许在用户设置层配置。来源：[Settings and security](https://code.visualstudio.com/docs/configure/settings#_settings-and-security)
- 单根 → 多根迁移时，VS Code 会把第一个根中的编辑器级设置搬进全局 Workspace 设置。来源：[Multi-root Workspaces - Settings](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_settings)

### 2. UI 呈现

- **添加 / 移除根**：`File > Add Folder to Workspace`、拖拽文件夹进 Explorer、原生文件对话框多选、命令行 `code --add a b`；移除通过根节点右键 `Remove Folder from Workspace`。来源：[Adding folders](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_adding-folders)、[Removing folders](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_removing-folders)
- **Explorer 模型**：每个根文件夹作为 File Explorer 的顶层节点平铺呈现，可在根之间移动文件；`folders[].name` 可自定义根的显示名。来源：[Add Folder to Workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_add-folder-to-workspace)
- **Untitled Workspace**：添加多个文件夹后先是标题为 UNTITLED WORKSPACE 的临时工作区（后台自动维护 `untitled.code-workspace`），功能与已保存工作区无差别；完全关闭窗口时询问是否保存，放弃则删除。来源：[Untitled multi-root workspaces](https://code.visualstudio.com/docs/editing/workspaces/workspaces#_untitled-multi-root-workspaces)
- `Save Workspace As` 会自动把 folder 路径改写为相对新位置的相对路径；打开途径包括双击 `.code-workspace` 文件、`File > Open Workspace`、Open Recent 列表（带 `(Workspace)` 后缀）。来源：[Save Workspace As](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_save-workspace-as)、[Opening workspace files](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_opening-workspace-files)
- **空工作区**：`folders` 可以留空，工作区仅承载设置 / tasks / launch。来源：[Workspaces FAQ](https://code.visualstudio.com/docs/editing/workspaces/workspaces#_can-i-use-a-multi-root-workspace-without-folders)
- **消歧**：多个根中存在同名文件时，编辑器标签加文件夹名消歧（可用 `workbench.editor.labelFormat` 控制）；OPEN EDITORS 与 Quick Open 列表同样带文件夹名。来源：[Multi-root Workspaces - Editor](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_editor)
- **跨根功能聚合**：
  - 搜索跨所有根、结果按文件夹分组；`files to include` 支持 `./根名/**` 语法限定单根。来源：[Search](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_search)
  - 调试：跨根汇总各 `launch.json`（带文件夹名后缀）并叠加 workspace 文件中的 `launch` 节区；变量按所属根解析，支持 `${workspaceFolder:根名}` 显式限定；compound 配置按名字引用，重名时用 `{"folder": "...", "name": "..."}` 语法。来源：[Debugging](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_debugging)
  - 任务：跨根自动检测 gulp/grunt/npm/tsc 与各根 `tasks.json`（须 2.0.0 版本），来源以文件夹名后缀标识。来源：[Tasks](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_tasks)
  - SCM：SOURCE CONTROL PROVIDERS 区块管理多仓库并存（可 Git 与其他 provider 混合），支持 Ctrl/Shift 多选查看。来源：[Source Control](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_source-control)

### 3. 扩展 API 如何感知多根

- `workspace.workspaceFolders: readonly WorkspaceFolder[] | undefined`（无工作区时为 `undefined`）；`WorkspaceFolder` 含 `uri` / `name` / `index`，**所有根地位平等，无 active/primary 根概念**。来源：[vscode-api — workspace.workspaceFolders](https://code.visualstudio.com/api/references/vscode-api#workspace.workspaceFolders)、[WorkspaceFolder](https://code.visualstudio.com/api/references/vscode-api#WorkspaceFolder)
- `workspace.getWorkspaceFolder(uri)` 返回包含该 uri 的根（无匹配返回 `undefined`）；`workspace.name` / `workspace.workspaceFile`（untitled 工作区返回 `untitled:` scheme）；`workspace.rootPath` 已废弃。来源：[getWorkspaceFolder](https://code.visualstudio.com/api/references/vscode-api#workspace.getWorkspaceFolder)、[workspace.name](https://code.visualstudio.com/api/references/vscode-api#workspace.name)、[workspace.workspaceFile](https://code.visualstudio.com/api/references/vscode-api#workspace.workspaceFile)、[workspace.rootPath](https://code.visualstudio.com/api/references/vscode-api#workspace.rootPath)
- `RelativePattern(base: string | Uri | WorkspaceFolder, pattern)`：官方推荐 base 传 `WorkspaceFolder`，用于 `createFileSystemWatcher` / `findFiles` / `DocumentFilter#pattern` 以限定单个根。来源：[RelativePattern](https://code.visualstudio.com/api/references/vscode-api#RelativePattern)
- `workspace.findFiles` 默认跨所有根搜索（glob 相对各根解析）；用 `RelativePattern` 可限定单根；无根时无结果。来源：[workspace.findFiles](https://code.visualstudio.com/api/references/vscode-api#workspace.findFiles)
- 变更事件与动态修改：`onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>`（含 added/removed 数组）；`workspace.updateWorkspaceFolders(start, deleteCount, ...{name, uri})` 以 splice 语义增删根。**注意**：第一个根变动或空/单根 ↔ 多根切换会重启扩展宿主，此时不触发该事件。来源：[onDidChangeWorkspaceFolders](https://code.visualstudio.com/api/references/vscode-api#workspace.onDidChangeWorkspaceFolders)、[updateWorkspaceFolders](https://code.visualstudio.com/api/references/vscode-api#workspace.updateWorkspaceFolders)
- **扩展适配声明**：官方 wiki《Adopting Multi Root Workspace APIs》要求扩展作者：消除 `rootPath` 假设、支持 0/1/N 根、在 `package.json` 的 `contributes.configuration` 中为设置标注 `scope: window | resource`、语言服务器改用 LSP 的 `workspaceFolders` / `didChangeWorkspaceFolders`；调试适配器基本不受影响。无正式能力声明字段，官方建议在 keywords 加 `"multi-root ready"` 标识。**未适配多根的扩展只在第一个根上工作**（fail-open 而非报错）。来源：[Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs)、[Multi-root Workspaces - Extensions](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_extensions)
- 辅助 API：`window.showWorkspaceFolderPick()` 让用户从多根中选择一根。来源：[同上 wiki](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs)

### 4. 对我们的启发

- **「空间文件」作为一等载体**：VSCode 用单个 `.code-workspace` 文件承载根列表 + 窗口级配置，且支持 untitled 临时态。dsh 的多项目空间同样可以设计为「一个可序列化的空间描述（根列表 + 空间级配置）」，而不是只存在于运行时。
- **根平等、cwd 归属改为 getWorkspaceFolder 式查找**：VSCode 用「uri 被哪个根包含」判定归属，取代单根精确相等。dsh 会话归属可从「cwd == workspace 路径」升级为「cwd 落在空间的某个根之下（前缀/包含匹配）」，与 `workspace.getWorkspaceFolder` 语义对齐。
- **配置分层与作用域纪律**：用户 < 空间 < 根 的覆盖链清晰，且用「window vs resource 作用域」解决多根下配置冲突。dsh 多项目空间可借鉴：空间级配置作用于全局，根级配置只允许「资源级」键，冲突时根级优先。
- **未适配者 fail-open 到第一个根**：兼容性策略上，VSCode 选择让旧扩展静默工作在第一个根而非报错——dsh 插件对「未感知多空间的旧会话」也可采用类似降级策略。
- **变量限定语法**：`${workspaceFolder:根名}` 的「变量:作用域」写法可借鉴到 dsh 的路径/上下文引用语法。

---

## 二、Cursor

> Cursor 是 VSCode fork，需区分两个不同概念：**A. 多根文件夹工作区**（继承自 VSCode 的 `.code-workspace` 机制）与 **B. 并行 agent 工作区（git worktree）**（Cursor 2.x 起自建的隔离机制）。

### A. 多根文件夹工作区

#### 1. 数据模型

- Cursor 官方确认支持 multi-root workspaces，官方文档 FAQ 直接链接到 VSCode 的 multi-root 文档，即机制上继承 VSCode 的 `.code-workspace` 模型。来源：[Cursor Docs — Agent Search FAQ "Does Cursor support multi-root workspaces?"](https://cursor.com/docs/agent/tools/search.md)（本调研已通过 curl 核对原文）
- `.code-workspace` schema 是否逐字继承（包括 Cursor 有无扩展字段）：**未找到一手来源**。
- 多根支持于 **Cursor 0.50（2025-05）** 正式上线，changelog 明确：工作区的所有文件夹 "will be indexed and available to Cursor"，且 `.cursor/rules` 对所有文件夹生效。来源：[Cursor Changelog 0.50](https://cursor.com/changelog/0-50)
- Cursor 3.2 changelog：Agents Window 支持 multi-root workspaces——"A single agent session can now target a reusable workspace made of multiple folders"，支持跨 frontend/backend/共享库的跨仓库改动。来源：[Cursor Changelog 3.2 — Multitasking, Worktrees and Multi-Root-Workspaces](https://cursor.com/changelog/04-24-26)（本调研已核对原文）

#### 2. UI 呈现

- 经典编辑器侧：作为 fork 继承 VSCode 的多根 Explorer 呈现；Cursor 特有 UI 差异**未找到一手来源**。
- Agents Window（Cursor 3 GA，2026-04-02）：agent 优先的统一界面，官方列出的独有功能包括 **Multi-workspace**（"work with agents across all your projects from one place"）、并行 agents、local ↔ cloud 交接、worktrees。来源：[Cursor Docs — Agents Window](https://cursor.com/docs/agent/agents-window.md)（本调研已核对原文）

#### 3. AI 功能如何感知多根

- **官方现行口径**："Each workspace folder's context is available to Agent."——每个根的上下文都对 Agent 可用。来源：[Cursor Docs — Agent Search FAQ](https://cursor.com/docs/agent/tools/search.md)
- **Codebase indexing 跨根**：0.50 changelog 明确所有文件夹都会被索引并对 Cursor 可用；已下线的官方 Codebase Indexing 文档页 FAQ（Wayback 存档）同样表述为全根索引。来源：[Cursor Changelog 0.50](https://cursor.com/changelog/0-50)、[Wayback 存档 — cursor.com/docs/context/codebase-indexing](https://web.archive.org/web/20260110115815/https://cursor.com/docs/context/codebase-indexing)
- **历史对照**：2025-02-20 Cursor 官方团队成员（deanrie）在官方 forum 确认当时「只索引同一（第一个）文件夹」；该能力差异由 0.50 版本补齐。（来源性质：官方 forum 中官方团队成员回复）来源：[forum.cursor.com — indexing only reads first folder](https://forum.cursor.com/t/indexing-only-reads-first-folder-in-the-workspace/2585/21)
- **多根下的能力降级（官方明示）**：依赖单一 git root 的功能（如 worktrees）在多根工作区下被禁用；Cloud Agents 不支持多根工作区。来源：[Cursor Docs — Agent Search FAQ](https://cursor.com/docs/agent/tools/search.md)
- **@-引用**：现行官方文档列出的 @ 引用类型为 @Files/@Folders/@Terminals/@Chats/@Git diffs/@Browser；旧文档中的 `@Codebase` 已从现行文档移除。各引用类型在多根下的逐项行为**未找到一手来源**。来源：[Cursor Help — @ mentions and context](https://cursor.com/help/customization/context.md)（本调研已核对原文）

#### 4. 对我们的启发

- **「全根索引 + 全根上下文可用」是 AI 多项目空间的基线承诺**：Cursor 从「只索引第一根」（2025-02）演进到「全根索引」（0.50），说明用户天然预期 AI 能看到空间内所有项目；dsh 多项目空间的上下文收集也应默认跨根。
- **显式声明能力降级**：Cursor 明确列出多根下哪些能力不可用（worktrees、Cloud Agents）而非静默失效。dsh 插件设计应同样维护一张「多空间下能力支持矩阵」。
- **可复用空间作为 agent 会话的目标**：Cursor 3.2 的 "reusable workspace made of multiple folders" 正是 dsh「多项目空间」的对应物——空间被 agent 会话整体引用，而不是逐个仓库切换。

### B. 并行 agent 工作区（git worktree）

#### 1. 数据模型

- Cursor 2.0 引入并行 agents：同一任务最多 8 个 agent 并行，用 **git worktrees 或远程机器**相互隔离。来源：[Cursor Changelog 2.0](https://cursor.com/changelog/2-0)
- Worktree = Agent 的隔离 Git checkout：每个任务有自己的文件、依赖与改动，主 checkout 不受影响。官方文档明示这是 UI 原生功能（Agents Window），IDE 内则用 Worktree Skills 命令。来源：[Cursor Docs — Worktrees](https://cursor.com/docs/configuration/worktrees.md)（本调研已核对原文）
- 配置载体 `.cursor/worktrees.json`：三个 setup 键 `setup-worktree` / `setup-worktree-unix` / `setup-worktree-windows`（OS 特定键优先），值可为顺序执行的 shell 命令数组或脚本文件路径；提供 `$ROOT_WORKTREE_PATH` 环境变量（如拷贝主 checkout 的 `.env`）。查找顺序：先在 worktree 路径、再在项目根路径。来源：同上
- 生命周期：agent 完成后可在 Agents Window 中 review，继续在 worktree 工作、从该 checkout 建 commit/PR，或用 `/apply-worktree` 把结果带回主 checkout、`/delete-worktree` 清理；IDE 内另有 `/worktree`（整段会话在隔离 checkout 中进行）与 `/best-of-n`（同任务多模型各占一个 worktree 对比）。来源：同上
- 运维机制：3.5 起用 mtime checkpoint 扫描发现 worktree（含外部 `git worktree add` 创建的）；自动清理由机器级设置 `cursor.worktreeMaxCount`（默认 25，全机共享上限）与 `cursor.worktreeCleanupIntervalHours` 控制。来源：同上

#### 2. UI 呈现

- Agents Window 中 worktree 是一等对象：后台跨分支跑隔离任务，"move any branch into your local foreground with one click"。来源：[Cursor Changelog 3.2](https://cursor.com/changelog/04-24-26)、[Cursor Docs — Agents Window](https://cursor.com/docs/agent/agents-window.md)
- CLI 同样支持 worktrees。来源：[Cursor Docs — Worktrees](https://cursor.com/docs/configuration/worktrees.md)

#### 3. 与「多根文件夹工作区」的区别（官方口径归纳）

| | 多根工作区（multi-root） | 并行 agent 工作区（worktree） |
| --- | --- | --- |
| 解决的问题 | 同窗口/同会话操作**多个不同仓库** | 同一仓库上**并行跑多个隔离任务** |
| 目录关系 | 多个互不相同的文件夹（可跨 repo） | 同一 git repo 的不同分支 checkout |
| 上下文 | 所有根共享、全根索引 | 各 worktree 相互隔离，主 checkout 不受影响 |
| 前提 | 无 git 要求 | 依赖单一 git root——**多根工作区下被禁用** |
| 官方来源 | [search FAQ](https://cursor.com/docs/agent/tools/search.md) | [worktrees 文档](https://cursor.com/docs/configuration/worktrees.md) |

另有第三条隔离路线 Cloud Agents（远程 VM 跑 agent），官方明示**不支持多根工作区**。来源：[Cursor Docs — Agent Search FAQ](https://cursor.com/docs/agent/tools/search.md)

#### 4. 对我们的启发

- **「多项目空间」与「并行隔离工作区」应作为两个独立概念设计**：前者解决归属与共享上下文（cwd → 空间根的包含匹配），后者解决并行会话的文件系统隔离；dsh 若未来支持并行 agent，可参考 worktree 路线而非复用多空间模型。
- **worktrees.json 的 setup 脚本契约**（OS 特定命令 + `$ROOT_WORKTREE_PATH`）是「创建隔离副本后自动初始化」的成熟设计，dsh 插件可直接借鉴。
- **清理与上限策略**（机器级 maxCount + 定时清理 + 外部创建者也纳入发现）值得 dsh 管理临时工作副本时参考。

---

## 三、JetBrains IDE（Attach Directory / 多 Content Root）

> 简要记录。IntelliJ 平台的模型比 VSCode 多一层 Module；且「Attach」在不同 IDE 中形态不同（小 IDE 直接支持，IDEA 走 Module / Workspace 插件路线）。

### 1. 数据模型

- SDK 定义的四级层次：**Project → Module → Content Root（ContentEntry）→ Source Root / Exclude Root**。"A module may have multiple content roots"；content root 定义 module 的文件系统边界。来源：[IntelliJ Platform SDK — Project Model](https://plugins.jetbrains.com/docs/intellij/project-model.html)（本调研已核对原文）
- **一对一约束**："Each directory can belong to one and only one module; it is not possible to share a content root between multiple modules."——与 VSCode 根可自由增删的松散模型不同。来源：[IntelliJ Platform SDK — Module](https://plugins.jetbrains.com/docs/intellij/module.html)
- **Attach 的平台本质**：扩展点 `com.intellij.projectAttachProcessor`（ProjectAttachProcessor），KDoc 语义为「把目录 projectDir 作为 module 挂进指定 project」——附加目录 = 新增一个 module。来源（官方源码）：[ProjectAttachProcessor.kt](https://github.com/JetBrains/intellij-community/blob/master/platform/ide-core/src/com/intellij/projectImport/ProjectAttachProcessor.kt)、[AttachProjectAction.kt](https://github.com/JetBrains/intellij-community/blob/master/platform/platform-impl/src/com/intellij/platform/AttachProjectAction.kt)
- **IDE 差异**：
  - 小 IDE（PhpStorm / WebStorm / PyCharm）：打开第二个项目时可选 **Attach**，作为 Project 窗口的另一顶层根目录加入；存在 **primary / attached** 之分（主项目永远排第一）；`Remove from Project View` 解除 attach（不动磁盘）。来源：[WebStorm — Opening, reopening, and closing projects](https://www.jetbrains.com/help/webstorm/opening-reopening-and-closing-projects.html)（本调研已核对原文）、[PhpStorm — Open, close and move projects](https://www.jetbrains.com/help/phpstorm/open-close-and-move-projects.html)、[PyCharm — Opening multiple projects](https://www.jetbrains.com/help/pycharm/opening-multiple-projects.html)
  - **IntelliJ IDEA 本体没有 File | Attach**（官方 YouTrack 答复："It is impossible to add the same feature in the IDEA（IDEA 使用 modules）"），等价操作是 Empty Project + `File | New | Module from Existing Sources`（"attaching another module to the project without physically moving any files"）。来源：[YouTrack IDEA-253194](https://youtrack.jetbrains.com/issue/IDEA-253194)、[IntelliJ IDEA — Creating and managing modules](https://www.jetbrains.com/help/idea/creating-and-managing-modules.html)
  - IDEA 的「一窗多项目」新方向是 **Multi-Project Workspace**（IDEA-65293，2024 年 Fixed）：`jb-workspace.xml` 仅存项目引用路径、不改原项目配置；Project 窗口列出全部项目。来源：[YouTrack IDEA-65293](https://youtrack.jetbrains.com/issue/IDEA-65293)、[IntelliJ IDEA — Workspaces](https://www.jetbrains.com/help/idea/workspaces.html)
- **存储**：directory-based 格式（现行默认）下项目设置在 `.idea/*.xml`，模块在 `.iml` 文件，模块清单在 `.idea/modules.xml`；旧格式为 `.ipr/.iws/.iml` 文件组。来源：[IntelliJ Platform SDK — Project](https://plugins.jetbrains.com/docs/intellij/project.html)、[IntelliJ IDEA — Projects](https://www.jetbrains.com/help/idea/creating-and-managing-projects.html)（本调研已核对原文）
- **文件夹类别**：Sources / Generated Sources / Test Sources / Generated Test Sources / Resources（Java）/ Test Resources / **Excluded**；Excluded 内容被 code completion、navigation、inspection 忽略（可提升性能），支持按名称模式排除（仅作用于所选 content root 内）。来源：[IntelliJ IDEA — Content roots](https://www.jetbrains.com/help/idea/content-roots.html)（本调研已核对原文）

### 2. UI 呈现

- 附加目录在 Project 工具窗口作为并列的顶层根目录；PyCharm 中 primary project 恒排第一。来源：[PyCharm — Opening multiple projects](https://www.jetbrains.com/help/pycharm/opening-multiple-projects.html)
- Project 窗口支持多视图（Project / Packages / Scope）；Workspace 形态下列出全部项目，workspace 文件位于 `Workspace Files | .idea` 节点。来源：[IntelliJ IDEA — Project tool window](https://www.jetbrains.com/help/idea/project-tool-window.html)、[IntelliJ IDEA — Workspaces](https://www.jetbrains.com/help/idea/workspaces.html)

### 3. 功能/插件如何感知多根

- 平台 API：`ProjectRootManager`（项目级根信息与变更通知）、`ModuleRootManager`（模块级 content entries / source roots / order entries）、`ProjectFileIndex`（从 VirtualFile 反查所属 module / content root / source root 类型）——后者即 JetBrains 版的 `getWorkspaceFolder` 归属查询。来源：[IntelliJ Platform SDK — Project Model](https://plugins.jetbrains.com/docs/intellij/project-model.html)
- 索引/搜索：Excluded root 被排除于 indexing、code completion、search、navigation、compilation；Find in Files 默认整个 project，可按 Module / Directory / Scope 收窄（Scope = 命名文件集合）。来源：[IntelliJ Platform SDK — Module](https://plugins.jetbrains.com/docs/intellij/module.html)、[IntelliJ IDEA — Find in Files](https://www.jetbrains.com/help/idea/finding-and-replacing-text-in-project.html)、[IntelliJ IDEA — Scopes](https://www.jetbrains.com/help/idea/scopes.html)
- VCS：directory-based versioning model——每个项目目录可关联不同 VCS（Settings | Version Control | Directory Mappings），并自动发现未注册的 Git/Mercurial 根。来源：[IntelliJ IDEA — Enabling version control](https://www.jetbrains.com/help/idea/enabling-version-control.html)
- **Attach 模型的官方限制（WebStorm 文档明示）**：attached 项目的符号对主项目可见、反之不行；沿用主项目的设置（code style、inspections）；attached 项目的 run configuration 被忽略、新配置存到主项目的 `.idea`；主项目不能在 attached 项目打开时单独关闭。来源：[WebStorm — Opening, reopening, and closing projects](https://www.jetbrains.com/help/webstorm/opening-reopening-and-closing-projects.html)（本调研已核对原文）
- `.iml` 中 content root 的具体 XML schema、多 content root 对索引性能的量化影响、detach 的配置回写细节：**未找到一手来源**。

### 4. 对我们的启发

- **主/从根（primary/attached）模型是「根平等」之外的另一种答案**：JetBrains attach 的限制清单（设置沿用主项目、符号单向可见、运行配置归主项目）说明「非平等根」会带来大量特例；VSCode 的根平等模型更干净。dsh 多项目空间建议坚持根平等，避免 primary 根特例。
- **目录 → module 一对一约束**提示：若 dsh 允许一个目录同时属于多个空间，归属判定（cwd → 空间）会产生歧义，需要像 JetBrains 一样明确禁止或定义优先级。
- **Directory Mappings / Scope 思路**：按目录挂不同配置（VCS、搜索范围）是「根级覆盖」的另一种呈现，dsh 空间的根级配置可借鉴。
- 与 VSCode 的对应关系（本节归纳，非官方）：workspace folder ≈ content root / attached root；`.code-workspace` ≈ `jb-workspace.xml`（纯引用清单）；JetBrains 多出 Module 中间层（独立 SDK/依赖），VSCode 无对应物。

---

## 四、横向对比表

| 维度 | VSCode multi-root | Cursor 多根（A） | Cursor worktree（B） | JetBrains |
| --- | --- | --- | --- | --- |
| 载体文件 | `.code-workspace`（JSONC，含 folders/settings/extensions/launch/tasks） | 继承 `.code-workspace`（逐字细节未找到一手来源） | git worktree + `.cursor/worktrees.json`（setup 脚本） | `.idea/` + `.iml` + `modules.xml`；新方案 `jb-workspace.xml`（纯引用清单） |
| 根列表模型 | `folders[{path, name}]`，相对/绝对路径，根平等无 primary | 同 VSCode；agent 会话可整体引用整个多根空间 | 同一 repo 的 N 个分支 checkout，与主 checkout 隔离 | Project → Module → Content Root 四级；目录与 module 一对一 |
| 归属判定 | `getWorkspaceFolder(uri)`：uri 被哪个根包含 | Agent 上下文含所有根（官方 FAQ） | 不适用（隔离而非归属） | `ProjectFileIndex` 反查所属 module/content root |
| 配置分层 | User < Workspace < Folder（folder 仅 resource 级生效） | `.cursor/rules` 对所有根生效（0.50） | 机器级清理设置（maxCount 默认 25） | 项目设置共享、SDK 可按 module 单独设；attach 模式下沿用主项目设置 |
| UI 呈现 | Explorer 多顶层根、UNTITLED WORKSPACE 临时态、同名文件标签消歧 | 经典编辑器继承 VSCode；Agents Window 提供 multi-workspace 统一视图 | Agents Window 中 worktree 为一等对象，可一键移到前台 | Project 窗口并列根；attach 模型有 primary/attached 之分 |
| AI/索引跨根 | 无内置 AI（扩展维度：`workspaceFolders` / `RelativePattern` / `findFiles` 跨根） | **全根索引、全根上下文可用**（0.50 起；此前仅第一根） | 各 worktree 相互隔离 | 索引按 content root；Excluded 目录全排除 |
| 显式降级 | 未适配扩展只工作在第一个根 | 多根下 worktrees 禁用、Cloud Agents 不支持 | 要求单一 git root | attach：符号单向可见、运行配置归主项目 |
| 并行隔离 | 无 | 无（多根本身不隔离） | 最多 8 个并行 agent（2.0），git worktree / 远程机器隔离 | 无 |
| 空空间 | 支持（folders 可为空，仅承载配置） | 未找到一手来源 | 不适用 | 支持（Empty Project + modules） |

**对 dsh「多项目空间」插件的核心结论**：

1. 三家都收敛到「**一个可序列化的空间描述文件 + 根列表**」（`.code-workspace` / `jb-workspace.xml`），dsh 空间也应有持久化载体。
2. 会话归属应从「cwd 精确相等」升级为「**cwd 被某个根包含**」（`getWorkspaceFolder` / `ProjectFileIndex` 语义）。
3. **根平等**优于 primary/attached（JetBrains attach 的特例清单是反面教材）。
4. AI 场景的基线承诺是「**全根索引、全根上下文可用**」（Cursor 0.50 的演进方向）。
5. 「多项目空间」与「并行隔离工作区」是两个独立概念（Cursor 的 multi-root vs worktree 分野），不应混为一个模型。
6. 需要一张**多空间下能力降级矩阵**，显式声明而非静默失效（Cursor 的做法）。
