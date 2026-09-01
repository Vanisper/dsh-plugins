import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { SandboxModeName, SpaceEntity } from '../domain/types.ts'
import type { SpacesStore } from '../store/spaces.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { bindChatWorkspaceId, createChat, dropChat } from '../domain/chats.ts'
import { auditBinding, auditChat, doctorSpace } from '../domain/doctor.ts'
import { resolveByCwd } from '../domain/resolve.ts'
import { attachFolder, bindWorkspaceId, createSpace, detachFolder, dropSpace, effectivePath, findSpace, listFolders, setFolderDesc, setFolderTitle, setPrimary } from '../domain/space.ts'
import { TOOL_NAME } from '../shared/constants.ts'
import { coreRows, registerCoreWorkspace } from './core-workspace.ts'

interface ExecAgentCarrier {
  agent?: { session?: { header?: { cwd?: string } } }
}

function cwdOf(exec: ExecAgentCarrier): string | undefined {
  return exec.agent?.session?.header?.cwd
}

function resolveMode(ctx: Context, exec: ExecAgentCarrier): SandboxModeName | 'unknown' {
  try {
    const session = exec.agent?.session
    if (!session)
      return 'unknown'
    return ctx.get('sandboxPolicy')?.resolve({ session: session as never }).mode ?? 'unknown'
  }
  catch {
    return 'unknown'
  }
}

/** 工具的输出契约是 JSON 值：undefined 键会被丢弃，正好用于省略空字段 */
function asJson(value: object): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(value))
}

const warn = (message: string): void => console.warn(message)

const TOOL_DESCRIPTION = `多项目空间（dsh-space）工具：两条创建路径——工作区（建壳目录，多目录：成员以 reference 原地引用（默认）或 link 壳内 symlink 挂入）与对话（静默在托管根 chats/<日期>/ 下建目录）。两者都登记核心工作区行并持有 id 绑定。
动作：list（cwd 在空间内时列出该空间成员与状态，否则列出全部空间与对话）｜ create（建空间：建壳 + 登记绑定，name 必填，target 可选作首个成员）｜ attach（挂入目录，target 为路径，可选 mode/title/desc/name）｜ detach（摘除成员，不动真实目录；link 成员连带删除壳内 symlink）｜ primary（设主成员，纯字段不联动排序）｜ title / desc（成员显示名/说明，空串清除）｜ doctor（逐成员诊断可写性与链接健康度 + 绑定审计（悬空/错位/共享只报告不治愈）+ 对话实体健康）｜ chat（建对话：静默建目录 + 登记绑定，可选 name）｜ chatdrop（删对话注册表记录，磁盘不动）｜ drop（删空间注册表记录，磁盘不动）。
空间解析：匹配面只有有效路径一棵树（壳 ?? primary ?? 首位成员）的子树；成员目录是纯注解、不是匹配面也不是会话入口。cwd 不在任何空间时用 space 参数指定。
约束：同一文件夹可属于多个空间；绑定遵循 id-first（path 仅作一致性校验）；sessionId 零持久化，会话归属由绑定行的核心账目承载；chatdrop/drop 不删除用户数据。`

/** 注册模型侧 space 工具 */
export function registerTool(ctx: Context, store: SpacesStore): void {
  /** 解析目标空间：显式 space 参数优先，否则 cwd 所在空间（有效路径子树） */
  const resolveSpace = (args: { space?: string }, exec: ExecAgentCarrier): SpaceEntity => {
    const data = store.listSpaces()
    if (args.space)
      return findSpace(data, args.space)
    const cwd = cwdOf(exec)
    const hit = cwd ? resolveByCwd(data, cwd) : undefined
    if (!hit)
      throw new Error('当前会话目录不属于任何空间，且未指定 space 参数（可用 list 查看全部空间）')
    return hit
  }

  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | attach | detach | primary | title | desc | doctor | chat | chatdrop | drop' },
      target: { type: 'string', description: 'attach 的目录路径；detach/primary/title/desc 的成员引用（路径、显示名或目录名）；create 的首个成员路径；chatdrop 的对话引用；drop 的空间名' },
      space: { type: 'string', description: '目标空间（名称或 id）；缺省用会话 cwd 所在空间' },
      name: { type: 'string', description: 'create 的空间名称；chat 的对话名；attach 的壳内链接名' },
      title: { type: 'string', description: 'attach/title 的显示名；空串清除' },
      desc: { type: 'string', description: 'attach/desc 的一句话说明；空串清除' },
      mode: { type: 'string', description: 'attach 的挂载形态：reference（原地引用，默认）| link（壳内 symlink）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value ?? {}, null, 2) }],
    },
    async execute(args, exec) {
      try {
        const data = store.listSpaces()
        const chats = store.listChats()
        const action = String(args.action ?? '')

        switch (action) {
          case 'list': {
            const cwd = cwdOf(exec)
            const hit = cwd ? resolveByCwd(data, cwd) : undefined
            if (!hit)
              return asJson({ ok: true, root: store.root(), spaces: data.map(s => ({ id: s.id, name: s.name, shell: s.shell, primary: s.primary, workspaceId: s.workspaceId, effectivePath: effectivePath(s), folders: s.folders })), chats })
            return asJson({ ok: true, space: hit, statuses: await listFolders(hit) })
          }
          case 'create': {
            if (!args.name)
              return asJson({ ok: false, error: 'create 需要 name（空间名称，同时是壳目录名）' })
            const result = await createSpace(data, args.name, store.root(), args.target)
            // 建壳即幂等登记核心工作区行，绑定从第一天存在（id-first 的唯一常驻写入点）
            const workspaceId = await registerCoreWorkspace(ctx, result.space.shell!, result.space.name, warn)
            const bound = workspaceId
              ? bindWorkspaceId(result.data, result.space.name, workspaceId)
              : { data: result.data, space: findSpace(result.data, result.space.name) }
            await store.save(bound.data, chats)
            return asJson({ ok: true, space: bound.space, workspaceRegistered: Boolean(workspaceId) })
          }
          case 'attach': {
            if (!args.target)
              return asJson({ ok: false, error: 'attach 需要 target（目录路径）' })
            const mode = args.mode === undefined ? undefined : args.mode === 'link' ? 'link' : args.mode === 'reference' ? 'reference' : undefined
            if (args.mode !== undefined && mode === undefined)
              return asJson({ ok: false, error: `mode 只接受 link | reference，收到 ${args.mode}` })
            const space = resolveSpace(args, exec)
            const result = await attachFolder(data, space.name, args.target, { mode, name: args.name, title: args.title, desc: args.desc })
            await store.save(result.data, chats)
            return asJson({ ok: true, folder: result.folder, primary: result.space.primary })
          }
          case 'detach': {
            if (!args.target)
              return asJson({ ok: false, error: 'detach 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await detachFolder(data, space.name, args.target)
            await store.save(result.data, chats)
            return asJson({ ok: true, detached: result.folder, note: '真实目录未动；link 成员的壳内 symlink 已一并移除' })
          }
          case 'primary': {
            if (!args.target)
              return asJson({ ok: false, error: 'primary 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await setPrimary(data, space.name, args.target)
            await store.save(result.data, chats)
            return asJson({ ok: true, primary: result.space.primary })
          }
          case 'title': {
            const space = resolveSpace(args, exec)
            if (!args.target || args.title === undefined)
              return asJson({ ok: false, error: 'title 需要 target（成员引用）与 title（空串清除）' })
            const result = await setFolderTitle(data, space.name, args.target, args.title)
            await store.save(result.data, chats)
            return asJson({ ok: true, folder: result.folder })
          }
          case 'desc': {
            const space = resolveSpace(args, exec)
            if (!args.target || args.desc === undefined)
              return asJson({ ok: false, error: 'desc 需要 target（成员引用）与 desc（空串清除）' })
            const result = await setFolderDesc(data, space.name, args.target, args.desc)
            await store.save(result.data, chats)
            return asJson({ ok: true, folder: result.folder })
          }
          case 'doctor': {
            const space = resolveSpace(args, exec)
            const cwd = cwdOf(exec) ?? ''
            const rows = coreRows(ctx)
            const report = await doctorSpace(space, cwd, resolveMode(ctx, exec))
            return asJson({
              ok: true,
              report,
              binding: auditBinding(space, rows, data),
              chats: await Promise.all(chats.map(chat => auditChat(chat, rows))),
            })
          }
          case 'chat': {
            const result = await createChat(chats, store.root(), args.name)
            const slug = result.chat.path.split('/').pop() ?? result.chat.path
            const workspaceId = await registerCoreWorkspace(ctx, result.chat.path, slug, warn)
            const bound = workspaceId
              ? bindChatWorkspaceId(result.data, result.chat.path, workspaceId)
              : { data: result.data, chat: result.chat }
            await store.save(data, bound.data)
            return asJson({ ok: true, chat: bound.chat, workspaceRegistered: Boolean(workspaceId), hint: '对话目录已建好并登记；从该目录创建会话即可' })
          }
          case 'chatdrop': {
            const ref = args.target ?? args.name
            if (!ref)
              return asJson({ ok: false, error: 'chatdrop 需要 target（对话路径或目录名）' })
            const result = await dropChat(chats, ref)
            await store.save(data, result.data)
            return asJson({ ok: true, dropped: result.chat.path, note: '只删了注册表记录；目录与核心行未动' })
          }
          case 'drop': {
            const ref = args.target ?? args.space ?? args.name
            if (!ref)
              return asJson({ ok: false, error: 'drop 需要空间名（target/space/name 任一）' })
            const result = dropSpace(data, ref)
            await store.save(result.data, chats)
            return asJson({ ok: true, dropped: result.space.name, note: '只删了注册表记录；壳目录与成员文件均未动，可手工清理' })
          }
          default:
            return asJson({ ok: false, error: `未知动作：${action || '(空)'}（可用：list | create | attach | detach | primary | title | desc | doctor | chat | chatdrop | drop）` })
        }
      }
      catch (error) {
        return asJson({ ok: false, error: (error as Error).message })
      }
    },
  }))
}
