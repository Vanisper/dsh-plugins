# 会话级多目录机制对标调研（Codex CLI / Claude Code / Aider / Windsurf）

> 调研背景：dsh 当前的 workspace 模型是「一个 workspace = 一个目录路径，会话仅当 cwd 与该路径精确相等时归属」。本调研为「多项目空间」插件设计提供同类 AI 编码工具的对标参考。
>
> 资料口径：仅使用一手资料（官方文档、官方 GitHub 仓库源码/README/changelog/issue），不使用二手博客。不确定或找不到一手来源的点明确标注「未找到一手来源」。

---

## 1. OpenAI Codex CLI

> 调研基准：openai/codex 仓库 main 分支 commit [`b7cd519c`](https://github.com/openai/codex/tree/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1)（浅克隆本地核对）。注意仓库内 `docs/config.md` 已改为跳转页，指向官方新文档站 developers.openai.com。

### 数据模型

Codex 的多目录模型 = **1 个 cwd（恒为 workspace_roots 第一项）+ N 个额外可写根（additional writable roots）**，额外目录有两种注入途径：

| 途径 | 生命周期 | 说明 |
| --- | --- | --- |
| `--add-dir <path>`（CLI 标志，可重复） | 会话级（运行时覆盖层，不写入 config.toml） | "Additional directories that should be writable alongside the primary workspace" |
| `[sandbox_workspace_write].writable_roots`（config.toml） | 持久配置 | 持久版的 `--add-dir` |

- `--add-dir` 的会话级性质有直接源码证据：它经由 `ConfigOverrides.additional_writable_roots` 传递（harness/运行时覆盖层而非配置文件层），该字段注释原文："Additional directories that should be treated as writable roots **for this session**"（[core/src/config/mod.rs#L2582-L2586](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/core/src/config/mod.rs#L2582-L2586)）。
- CLI 参数定义（clap）：[utils/cli/src/shared_options.rs#L70-L72](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/utils/cli/src/shared_options.rs#L70-L72)；传递链路见 [exec/src/lib.rs#L435](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/exec/src/lib.rs#L435)、[cli/src/main.rs#L2233](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/cli/src/main.rs#L2233)、[tui/src/startup_orchestration.rs#L128](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/tui/src/startup_orchestration.rs#L128)。
- 官方 CLI 文档描述："Grant additional directories write access alongside the main workspace. Repeat for multiple paths."（[Codex CLI reference](https://developers.openai.com/codex/cli/reference)）
- Config 加载时把 `--add-dir` 目录解析为绝对路径后，与 cwd、`[sandbox_workspace_write].writable_roots` **合并去重**构成 `workspace_roots`（cwd 恒为第一项）：[core/src/config/mod.rs#L3354-L3361 与 #L3448-L3461](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/core/src/config/mod.rs#L3354-L3361)。

**config.toml 配置形态**：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["~/code"]        # 额外可写根（持久版的 --add-dir）
network_access = false
exclude_tmpdir_env_var = true
exclude_slash_tmp = true

[projects."/path/to/project"]
trust_level = "trusted"            # 仅表达信任，不表达可写目录
```

- `SandboxWorkspaceWrite` 结构体定义（4 个字段）：[config/src/types.rs#L930-L941](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/config/src/types.rs#L930-L941)；官方 config reference 条目 `sandbox_workspace_write.writable_roots` — "Additional writable roots when `sandbox_mode = \"workspace-write\"`"（[Codex config reference](https://developers.openai.com/codex/config-reference)）。
- `[projects]` 是 trusted projects 表：`projects: Option<HashMap<String, ProjectConfig>>`，键为项目路径，`ProjectConfig` 只有 `trust_level`（"trusted" | "untrusted"）（[config/src/config_toml.rs#L432、#L545-L557](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/config/src/config_toml.rs#L432)）。查表逻辑按 cwd 及 git repo root 规范化路径查找（`get_active_project`，[config_toml.rs#L820-L844](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/config/src/config_toml.rs#L820-L844)）。**`[projects]` 只表达信任**（决定是否加载项目级 `.codex/` 配置、hooks、rules 及默认审批策略），不表达可写目录——多目录授权走 `--add-dir`（会话级）或 `writable_roots`（持久）。官方描述："Untrusted projects skip project-scoped `.codex/` layers, including project-local config, hooks, and rules."（[config reference](https://developers.openai.com/codex/config-reference)）

### 权限/沙盒处理

- `--add-dir` 的效果就是把额外目录**并入本次会话的 workspace-write 沙盒可写根**，与 cwd、`writable_roots` 同级对待，没有单独的审批层级。
- 边界行为：若生效权限不是 workspace-write / danger-full-access（如 read-only），`--add-dir` 会被拒绝，TUI 直接报错退出："Ignoring --add-dir … because the effective permissions do not allow additional writable roots"（[tui/src/additional_dirs.rs#L36-L43](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/tui/src/additional_dirs.rs#L36-L43)、[startup_orchestration.rs#L426-L437](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/tui/src/startup_orchestration.rs#L426-L437)）。
- 权限说明指令模板向模型解释 workspace-write 语义，原文："The sandbox permits reading files, and editing files in `cwd` and `writable_roots`. Editing files in other directories requires approval."（[prompts/templates/permissions/sandbox_mode/workspace_write.md](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/prompts/templates/permissions/sandbox_mode/workspace_write.md)）
- 补充：config.toml 中没有 `--add-dir` 的等价物；持久多目录配置就是 `writable_roots`（legacy workspace-write 语法；新版 `[permissions]` profile 机制下另有 workspace roots 编译逻辑，见 [config/mod.rs#L3522-L3535](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/core/src/config/mod.rs#L3522-L3535)）。

### 模型如何感知

**不写进系统提示词（base instructions），而是每个 turn 以 user 角色的 `<environment_context>` 上下文块注入，可随状态变化做 diff 更新。**

- 注入物：`EnvironmentsState` 实现 `ContextualUserFragment`，`role() = "user"`，标签为 `<environment_context>`：[core/src/context/world_state/environment.rs](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/core/src/context/world_state/environment.rs)（struct #L29、role #L198/#L238、markers #L473-L478）。
- 渲染内容：每个 environment 输出 `<cwd>`，文件系统部分输出 `<filesystem><workspace_roots><root>…</root></workspace_roots>`——**root 列表就是 Config 的 workspace_roots，即 cwd + `--add-dir` 目录 + `writable_roots`**，外加 `<permission_profile>` 的读写条目：[core/src/context/environment_context.rs#L59-L71](https://github.com/openai/codex/blob/b7cd519c767c8fd4bc3581d9bc92fbab37a768c1/codex-rs/core/src/context/environment_context.rs#L59-L71)；数据来源 `FileSystemContext::from_permission_profile(permission_profile, environment.workspace_roots())`（environment.rs #L63-L68）。
- 可用 `include_environment_context = false` 关闭该注入块（config/mod.rs #L708-L709）。
- 另有权限说明指令模板（permissions instructions，见上节）向模型解释可写范围。

**云版 Codex（cloud / ChatGPT Codex）是否支持多 repo**：**未找到任何支持多 repo 的一手来源**；现有官方文档均以单 repo/单 environment 描述，且官方仓库的 Multi-repo 需求 issue 仍为 open。

- 官方 Cloud environments 文档：任务流程为 "Codex creates a container and checks out **your repo** at the selected branch or commit SHA"，缓存语义为 "clones **the repository**"（单数），全文无多仓库字段（[developers.openai.com/codex/cloud/environments](https://developers.openai.com/codex/cloud/environments)）。
- 官方入门："create an environment **for the repository you selected**"（单数）（[learn.chatgpt.com/docs/cloud.md](https://learn.chatgpt.com/docs/cloud.md)）。
- 官方仓库 issue [#11956 "Multi-repo support"](https://github.com/openai/codex/issues/11956) 状态 OPEN，正文请求为 Codex App/Web 增加类似 /add-dir 的能力，佐证云版尚无一等多 repo 支持。
- 变通：cloud environment 的 setup script 阶段有网络访问，可自行 `git clone` 其他仓库进容器，但这是脚本行为而非一等能力。

### 对我们的启发

- **「可写根」与「项目信任」是正交的两张表**：Codex 用 `writable_roots` 表达目录授权、用 `[projects]` 表达信任（是否加载项目级配置）。dsh 多项目空间设计时应同样区分「这个目录可以被读写」与「这个项目被信任/可加载配置」。
- **会话级注入走运行时覆盖层（ConfigOverrides），不落配置**——与 dsh「会话归属」语义天然契合：插件的会话级附加目录应存于会话状态而非 workspace 配置。
- **cwd 恒为 workspace_roots 第一项 + 合并去重**：保证主目录的优先级与幂等性，值得直接借鉴。
- **模型感知采用 user 角色的 `<environment_context>` 块 + diff 更新**，而非改写系统提示词：目录在会话中动态增删时可低成本地让模型感知变化。dsh 插件可在每轮注入 workspace_roots 列表。
- **权限模式不兼容时直接拒绝**（read-only 下 `--add-dir` 报错退出）：插件也应校验当前权限模式是否允许扩展可写根，避免静默失效。
- 云版多 repo 是公认空白（issue #11956 open），说明「会话级多目录」在云端容器场景是差异化机会。

---

## 2. Claude Code

### 数据模型

Claude Code 的多目录模型 = **1 个 primary working directory（可用 `/cd` 整体迁移）+ N 个 additional working directories**。额外目录有三种注入途径，生命周期各不同：

| 途径 | 生命周期 | 官方描述 |
| --- | --- | --- |
| `--add-dir <path>`（CLI 启动参数） | 会话级（仅本次会话） | "Add additional working directories for Claude to read and edit files. … To persist these directories across sessions, set `permissions.additionalDirectories` in settings" |
| `/add-dir <path>`（会话内斜杠命令） | 会话级（会话内动态添加） | "Add a working directory for file access during the current session." |
| `permissions.additionalDirectories`（settings.json） | 持久配置 | `"permissions": {"additionalDirectories": ["../docs/"]}` |

官方权限文档直接给出这三种方式的对照："During startup: `--add-dir <path>`; During session: `/add-dir`; Persistent configuration: `additionalDirectories` in settings files"。settings-reference 也明确："**Per-session overrides**: `--add-dir` and `/add-dir` add directories for one session alongside this key"。

来源：[CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)、[settings-reference#permissions-additionaldirectories](https://docs.anthropic.com/en/docs/claude-code/settings-reference#permissions-additionaldirectories)、[permissions#working-directories](https://docs.anthropic.com/en/docs/claude-code/permissions#working-directories)

演进时间线（CHANGELOG）：

- `--add-dir` 首现于 **v1.0.18**："Added --add-dir CLI argument for specifying additional working directories"。
- v2.1.219：新增 `DirectoryAdded` hook，`/add-dir` 或 SDK `register_repo_root` 在会话中注册新工作目录后触发。
- v2.1.234：`/add-dir` 可在 Claude 工作期间使用，确认后同一回合的下一个 tool call 即可访问（此前排队到回合结束）。
- v2.1.118：`--continue`/`--resume` 能找到「曾用 `/add-dir` 添加过当前目录」的会话。
- 存在 `/add-dir --remember` 持久化写设置的路径（v2.1.101 changelog 侧面证实）。

来源：[anthropics/claude-code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### 权限/沙盒处理

**额外目录与主目录遵循同一套权限规则，无单独审批**：

> "Files in additional directories follow the **same permission rules as the original working directory**: they become **readable without prompts**, and **file editing permissions follow the current permission mode**."（[permissions 文档](https://docs.anthropic.com/en/docs/claude-code/permissions)）

permission mode 表中 `acceptEdits` 明确覆盖额外目录："Automatically accepts file edits and common filesystem commands … for paths **in the working directory or `additionalDirectories`**"。

settings 里的 `permissions.additionalDirectories`：

- 类型为目录路径数组，默认未设置；用户/项目/本地/托管 settings 均可配置。
- 写在项目 `.claude/settings.json` 里的条目**要在接受该文件夹的 workspace trust 对话框后才生效**（trust 对话框会列出将要授予的目录供审阅；`deny`/`ask` 规则不受此限制）。
  - 来源：[settings-reference#permissions-additionaldirectories](https://docs.anthropic.com/en/docs/claude-code/settings-reference#permissions-additionaldirectories)、[permissions#project-allow-rules-and-workspace-trust](https://docs.anthropic.com/en/docs/claude-code/permissions#project-allow-rules-and-workspace-trust)

**重要区分：「授予文件访问 ≠ 配置发现」**。官方文档反复强调：settings 途径的 `additionalDirectories` 只授予文件访问，**不加载**额外目录里的 `.claude/skills/`、`.claude/commands/`、`.claude/agents/` 等配置；只有 `--add-dir`/`/add-dir`（含 SDK 传入，SDK 会转成 `--add-dir`）添加的目录才会额外加载少量配置。CLAUDE.md 默认也不从额外目录加载，需设置 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`。

来源：[permissions#additional-directories-grant-file-access-not-configuration](https://docs.anthropic.com/en/docs/claude-code/permissions#additional-directories-grant-file-access-not-configuration)、[slash-commands 文档](https://docs.anthropic.com/en/docs/claude-code/slash-commands)

其他细节：背景会话（`/bg`）保留 `/add-dir` 添加的目录；`/cd` 迁移会话后采用新目录 settings 的 additionalDirectories，但保留会话内动态添加的目录（CHANGELOG）。

### 模型如何感知

- 官方文档确认「working directory」属于系统提示词中按机器动态生成的段落：CLI reference 的 `--exclude-dynamic-system-prompt-sections` 标志描述为 "Move **per-machine sections from the system prompt (working directory, environment info, memory paths, git-repo flag)** into the first user message"。（[CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)）
- 具体呈现措辞的一手证据来自官方仓库 issue [anthropics/claude-code#81600](https://github.com/anthropics/claude-code/issues/81600)（OPEN，带官方 `area:core` 标签；为用户实测报告，无官方回复）：模型 system context 的 `# Environment` 段落使用 `Primary working directory: …` 及 "Additional working directories" 条目形式；且发现 `--add-dir` 添加的目录会出现在 environment listing，而 settings `additionalDirectories` 授予的目录在 headless 模式下**不出现**（尽管实际可读，`permission_denials` 为空）——这是一条已知的不一致。
- 机器可读通道：CHANGELOG v2.1.47 新增 statusline JSON `workspace.added_dirs`，向外部脚本暴露 `/add-dir` 添加的目录（面向 statusline 脚本而非模型提示词）。（[CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)）

**标注**：官方文档没有逐字公开系统提示词中工作目录段落的完整模板；"Primary working directory / Additional working directories" 的确切措辞目前只能从 issue #81600 的用户实测引用获得，**未找到**官方文档对该段落模板的一手描述。

### 对我们的启发

- **三层注入模型清晰可借鉴**：启动参数（会话级）→ 会话内命令（动态）→ settings 持久化（需 trust）。dsh 多项目空间插件可对应设计：会话级附加目录（内存态）/ 会话内动态添加（插件命令）/ workspace 级持久配置。
- **「主目录 + 附加目录」非对称模型**比「多个平等根」简单：权限规则完全复用主目录一套，额外目录不做单独审批，降低了权限模型复杂度。
- **文件访问与配置发现分离**是一个重要设计决策：附加目录默认不加载对方的配置/skills，避免多项目空间的配置互相污染；如需要可用显式开关（类比 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`）。
- **信任门槛**：持久化的 additionalDirectories 写在项目 settings 时需 workspace trust 对话框列出授予目录——多项目空间把外部目录写入配置时也应有人工确认环节。
- **模型感知的一致性是坑**：Claude Code 自己都存在「settings 途径添加的目录不出现在环境描述里」的不一致（issue #81600）。dsh 插件应保证：无论目录从哪个途径加入，注入给模型的环境描述都一致列出。

---

## 3. Aider / Windsurf（顺带）

> 说明：Windsurf 官方文档域名 docs.windsurf.com 现 301 跳转到 docs.devin.ai（被 Cognition 收购后文档品牌改为 "Devin Desktop"），内容仍为 Windsurf 官方文档，以下引用原始路径。

### 数据模型

**Aider：没有「多目录/多 repo」一等概念，单 repo 锚定。**

- 官方 FAQ 明示："Currently aider can only work with one repo at a time."（[FAQ — Can I use aider with multiple git repos at once?](https://aider.chat/docs/faq.html#can-i-use-aider-with-multiple-git-repos-at-once)）
- 跨边界的官方路径只有**只读**一条：`--read FILE` / 会话内 `/read-only` 可把文件系统**任意位置**的文件以只读方式加入会话（维护者在 issue 中确认 "You can use --read to add files from anywhere in the file system"，[Issue #2088](https://github.com/Aider-AI/aider/issues/2088)；[配置选项文档](https://aider.chat/docs/config/options.html)、[会话内命令文档](https://aider.chat/docs/usage/commands.html)）。
- `/add` 支持目录与通配符（`/add src`、`/add src/*.py`），但可编辑范围始终锚定单一 git repo/子树（`--subtree-only` 下显式传入子树外路径会被忽略，见 issue #2088）。
- 范围圈定开关：`--gitignore` / `--add-gitignore-files` / `.aiderignore`（monorepo 内圈定排除目录）/ `--subtree-only`（[配置选项文档](https://aider.chat/docs/config/options.html)、[FAQ monorepo 段](https://aider.chat/docs/faq.html)）。

**Windsurf：有事实上的多根 workspace，但无 "multi-root workspace" 术语级专页（未找到一手来源）。**

- Memories & Rules 文档明确写道："**Multiple workspace support**: When multiple folders are open in the same workspace, rules are deduplicated and displayed with the shortest relative path"（[Memories & Rules](https://docs.windsurf.com/windsurf/cascade/memories)）。
- JetBrains 插件侧有 "Custom Workspaces"：设置里可多次 "Add Workspace" 添加多个项目目录；企业用户勾选哪些 workspace 参与索引，"Only workspaces with the checkbox enabled will be indexed and available to Cascade"（[JetBrains Troubleshooting — Custom Workspaces](https://docs.windsurf.com/troubleshooting/plugins-enterprise/jetbrains)）。
- 企业版还支持索引**远程仓库**："Devin Desktop can also index remote repositories. This is useful for companies whose development organization works across multiple repositories."（[Context Awareness 概览](https://docs.windsurf.com/context-awareness/windsurf-overview)）

### 权限/沙盒处理

- **Aider**：repo 外文件只有只读通道（`--read`/`/read-only`）；**未找到一手来源**说明 `/add` 可赋予 repo 外路径可写权限（仅 issue 层面的间接证据表明受限）。
- **Windsurf**：索引与工具调用按 workspace 作用域管控；企业版 JetBrains Custom Workspaces 下 "Tool calls are restricted to the active workspace for security"（非企业用户不限制）（[JetBrains Troubleshooting](https://docs.windsurf.com/troubleshooting/plugins-enterprise/jetbrains)）；`.codeiumignore` 放在 workspace 根（gitignore 语法），企业可在 `~/.codeium/` 放全局 ignore（[Windsurf Ignore](https://docs.windsurf.com/context-awareness/windsurf-ignore)）。

### 模型如何感知

- **Aider**：repo map 只覆盖当前 repo——"The repo map contains a list of the files in the repo, along with the key symbols which are defined in each file"，用图排序在 `--map-tokens`（默认 1k）预算内选最相关部分；加入会话的文件以完整内容进上下文，map 提供其余代码库的压缩视图（[Repo map 文档](https://aider.chat/docs/repomap.html)）。`/read` 进来的 repo 外文件只作为只读内容存在，**不进入 repo map**；跨 repo 共享地图靠变通：各 repo 跑 `aider --show-repo-map > map.md` 再互相 `/read`（[FAQ](https://aider.chat/docs/faq.html#can-i-use-aider-with-multiple-git-repos-at-once)）。
- **Windsurf**：以 workspace 为单位做全量代码库索引（"The entire local codebase is then indexed (including files that are not open)"，[Context Awareness](https://docs.windsurf.com/context-awareness/windsurf-overview)）；rules 从当前 workspace 及子目录、git root 父目录、同一 workspace 中打开的多个文件夹自动发现（`.windsurf/rules`、AGENTS.md 等，按目录作用域生效）；Memories 按 workspace 隔离（"Memories generated in one workspace are not available in another"）；Cascade 还感知用户 IDE 实时操作（[Cascade Overview](https://docs.windsurf.com/windsurf/cascade/cascade)）。

### 对我们的启发

- Aider 代表**最简模型**：单 repo 锚定 + repo 外只读引用。如果连「写」都不需要，只读引用已是低成本方案——dsh 插件可考虑「只读附加目录」作为第一档能力。
- Aider 的「导出 repo map 为 md 再交叉引用」变通提示：跨项目的高层次结构感知不一定需要一等支持，可以用**显式上下文产物**（地图文件）代替。
- Windsurf 代表**IDE 侧模型**：多根挂在「workspace」而非「会话」上，索引/rules/memories 都以 workspace 为作用域单位——这与 dsh「workspace = 目录」的现有模型更接近，dsh 的多项目空间本质上是把 Windsurf 的多根 workspace 下沉为可持久配置。
- Windsurf 的「多根下 rules 去重 + 最短相对路径展示」细节值得借鉴：多项目空间中同名/同类配置如何合并呈现需要明确规则。

---

## 横向对比表

| 维度 | OpenAI Codex CLI | Claude Code | Aider | Windsurf |
| --- | --- | --- | --- | --- |
| **一等多目录概念** | ✅ cwd + N 个可写根（workspace_roots） | ✅ primary + N 个 additional working directories | ❌ 单 repo 锚定（FAQ 明示） | ⚠️ 事实上多根 workspace，无术语级专页 |
| **会话级注入途径** | `--add-dir`（运行时覆盖层，不落配置） | `--add-dir` / `/add-dir`（含会话内动态添加、`DirectoryAdded` hook） | `/read-only`（仅只读） | 会话级概念未找到一手来源（多根挂在 workspace 上） |
| **持久配置形态** | `config.toml` `[sandbox_workspace_write].writable_roots` | `settings.json` `permissions.additionalDirectories` | 无 | Custom Workspaces 设置 / IDE workspace 文件 |
| **额外目录写权限** | 与 cwd 同级并入沙盒可写根；权限模式不兼容（read-only）直接拒绝启动 | 与主目录完全同规则（读免提示、写跟随 permission mode），无单独审批 | 无（repo 外仅只读） | 企业版工具调用限制在 active workspace |
| **信任/配置发现** | `[projects]` 信任表与目录授权正交；untrusted 跳过项目级 `.codex/` 层 | 文件访问 ≠ 配置发现；settings 途径需 workspace trust，不加载额外目录配置 | `.aiderignore` / `--subtree-only` 圈定范围 | rules 跨多根自动发现、去重；Memories 按 workspace 隔离 |
| **模型如何感知** | 每轮 user 角色 `<environment_context>` 块渲染 `<cwd>` + `<workspace_roots>`，可 diff 更新 | 系统提示词 per-machine 环境段（"Primary working directory" / "Additional working directories"，措辞证据来自 issue #81600） | repo map 覆盖单 repo；repo 外文件以完整内容进上下文 | workspace 级全量索引 + IDE 实时感知 |
| **已知坑/边界** | 云版 Codex 无一等多 repo（issue #11956 open） | settings 途径添加的目录在 headless 下不出现在环境描述（issue #81600） | 跨 repo 地图靠导出 map.md 变通 | 文档品牌迁移中（docs.devin.ai），无 multi-root 专页 |
| **来源** | [openai/codex 源码](https://github.com/openai/codex)、[CLI reference](https://developers.openai.com/codex/cli/reference)、[config reference](https://developers.openai.com/codex/config-reference) | [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)、[permissions](https://docs.anthropic.com/en/docs/claude-code/permissions)、[settings-reference](https://docs.anthropic.com/en/docs/claude-code/settings-reference) | [aider FAQ](https://aider.chat/docs/faq.html)、[repo map](https://aider.chat/docs/repomap.html)、[options](https://aider.chat/docs/config/options.html) | [Memories & Rules](https://docs.windsurf.com/windsurf/cascade/memories)、[Context Awareness](https://docs.windsurf.com/context-awareness/windsurf-overview)、[JetBrains Custom Workspaces](https://docs.windsurf.com/troubleshooting/plugins-enterprise/jetbrains) |

**对 dsh 多项目空间插件的总体结论**：

1. **「主目录 + 附加目录」的非对称模型是主流共识**（Codex、Claude Code 均如此），且权限上都复用主目录一套规则、不做单独审批——这比「多个平等根」简单得多，适合作为 dsh 插件的第一版模型。
2. **三层生命周期都要支持**：会话级（运行时覆盖，不落盘）→ 会话内动态添加（带 hook/确认）→ 持久配置（带信任确认）。Codex 缺会话内动态添加，Claude Code 三层齐全，可作为完整参照。
3. **目录授权与项目信任/配置发现必须正交**（Codex 的 `writable_roots` vs `[projects]`、Claude Code 的文件访问 vs 配置发现，是同一设计的两种表达）。
4. **模型感知推荐 Codex 式**：每轮以环境上下文块注入 `cwd` + `workspace_roots` 列表，变化时 diff 更新；且要保证任何途径加入的目录都被一致呈现（Claude Code issue #81600 是反面教材）。
5. **Aider 的只读档**提示可以分级：只读附加目录（低风险、可免审批）→ 可写附加目录（并入沙盒根、跟随权限模式）。
