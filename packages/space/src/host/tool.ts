import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { SandboxModeName, SpaceEntity } from '../domain/types.ts'
import type { SpaceOperations } from './operations.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { auditBinding, auditChat, doctorSpace } from '../domain/doctor.ts'
import { resolveByCwd } from '../domain/resolve.ts'
import { findSpace, listFolders } from '../domain/space.ts'
import { TOOL_NAME } from '../shared/constants.ts'

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

function modeOf(value: unknown): 'link' | 'reference' | undefined {
  if (value === undefined)
    return undefined
  if (value === 'link' || value === 'reference')
    return value
  throw new Error(`mode 只接受 link | reference，收到 ${String(value)}`)
}

const TOOL_DESCRIPTION = `多项目工作区（dsh-space）工具。工作区创建时在插件托管目录建立固定壳目录，并登记为核心 workspace；对话创建时在 chats/<日期>/ 下建立目录并登记为核心 workspace。插件注册表只补充成员、主成员和说明，不承载会话归属。
动作：list（列出当前工作区或全部注册表）｜create（创建工作区，可原子挂入首成员）｜attach / detach（维护成员）｜primary（设置主成员，只改成员标记）｜title / desc（成员元数据）｜doctor（诊断目录与核心绑定）｜rebind（显式修复核心绑定）｜chat / chatdrop（创建或移除对话记录）｜drop（移除工作区附加记录）。
约束：工作区会话入口始终是壳目录；primary 不改变 cwd、核心绑定或会话归组；会话归属只认核心 workspace 的 sessionIds；drop/chatdrop 不删除磁盘目录。`

/** 注册模型侧 space 工具 */
export function registerTool(ctx: Context, operations: SpaceOperations): void {
  const resolveSpace = (args: { space?: string }, exec: ExecAgentCarrier): SpaceEntity => {
    const spaces = operations.snapshot().spaces
    if (args.space)
      return findSpace(spaces, args.space)
    const cwd = cwdOf(exec)
    const hit = cwd ? resolveByCwd(spaces, cwd) : undefined
    if (!hit)
      throw new Error('当前会话目录不属于任何工作区壳目录，且未指定 space 参数（可用 list 查看全部工作区）')
    return hit
  }

  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | attach | detach | primary | title | desc | doctor | rebind | chat | chatdrop | drop' },
      target: { type: 'string', description: 'create 的首成员路径；attach 的目录路径；成员操作的成员引用；chatdrop 的对话引用；drop 的工作区引用' },
      space: { type: 'string', description: '目标工作区（名称或 id）；缺省时按当前会话的壳目录解析' },
      chat: { type: 'string', description: 'rebind 要修复的对话引用；与 space 二选一' },
      name: { type: 'string', description: 'create 的工作区名称；chat 的对话名；attach 的壳内链接名' },
      linkName: { type: 'string', description: 'create 以 link 挂入首成员时的壳内链接名' },
      title: { type: 'string', description: 'attach/title 的显示名；空串清除' },
      desc: { type: 'string', description: 'attach/desc 的一句话说明；空串清除' },
      mode: { type: 'string', description: '成员挂入方式：reference（默认）| link（壳内 symlink）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value ?? {}, null, 2) }],
    },
    async execute(args, exec) {
      try {
        const action = String(args.action ?? '')
        switch (action) {
          case 'list': {
            const snapshot = operations.snapshot()
            const cwd = cwdOf(exec)
            const hit = cwd ? resolveByCwd(snapshot.spaces, cwd) : undefined
            if (!hit)
              return asJson({ ok: true, ...snapshot })
            return asJson({ ok: true, space: hit, statuses: await listFolders(hit) })
          }
          case 'create': {
            if (!args.name)
              return asJson({ ok: false, error: 'create 需要 name（工作区名称，同时是壳目录名）' })
            const result = await operations.execute({
              op: 'create-space',
              name: String(args.name),
              folder: args.target === undefined ? undefined : String(args.target),
              mode: modeOf(args.mode),
              linkName: args.linkName === undefined ? undefined : String(args.linkName),
              title: args.title === undefined ? undefined : String(args.title),
              desc: args.desc === undefined ? undefined : String(args.desc),
            })
            return asJson({ ok: true, ...result })
          }
          case 'attach': {
            if (!args.target)
              return asJson({ ok: false, error: 'attach 需要 target（目录路径）' })
            const space = resolveSpace(args, exec)
            const result = await operations.execute({
              op: 'attach',
              space: space.id,
              target: String(args.target),
              mode: modeOf(args.mode),
              name: args.name === undefined ? undefined : String(args.name),
              title: args.title === undefined ? undefined : String(args.title),
              desc: args.desc === undefined ? undefined : String(args.desc),
            })
            return asJson({ ok: true, ...result })
          }
          case 'detach': {
            if (!args.target)
              return asJson({ ok: false, error: 'detach 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await operations.execute({ op: 'detach', space: space.id, target: String(args.target) })
            return asJson({ ok: true, ...result, note: '真实目录未动；link 成员的壳内 symlink 已一并移除' })
          }
          case 'primary': {
            if (!args.target)
              return asJson({ ok: false, error: 'primary 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await operations.execute({ op: 'primary', space: space.id, target: String(args.target) })
            return asJson({ ok: true, ...result, note: '壳目录、核心绑定与会话归组保持不变' })
          }
          case 'title': {
            if (!args.target || args.title === undefined)
              return asJson({ ok: false, error: 'title 需要 target（成员引用）与 title（空串清除）' })
            const space = resolveSpace(args, exec)
            const result = await operations.execute({ op: 'title', space: space.id, target: String(args.target), value: String(args.title) })
            return asJson({ ok: true, ...result })
          }
          case 'desc': {
            if (!args.target || args.desc === undefined)
              return asJson({ ok: false, error: 'desc 需要 target（成员引用）与 desc（空串清除）' })
            const space = resolveSpace(args, exec)
            const result = await operations.execute({ op: 'desc', space: space.id, target: String(args.target), value: String(args.desc) })
            return asJson({ ok: true, ...result })
          }
          case 'doctor': {
            const snapshot = operations.snapshot()
            const space = resolveSpace(args, exec)
            const rows = operations.coreRows()
            return asJson({
              ok: true,
              report: await doctorSpace(space, cwdOf(exec) ?? '', resolveMode(ctx, exec)),
              binding: auditBinding(space, rows, snapshot.spaces),
              chats: await Promise.all(snapshot.chats.map(chat => auditChat(chat, rows))),
            })
          }
          case 'rebind': {
            if (args.chat !== undefined && args.space !== undefined)
              return asJson({ ok: false, error: 'rebind 的 space 与 chat 只能提供一个' })
            if (args.chat !== undefined) {
              const result = await operations.execute({ op: 'rebind-chat', chat: String(args.chat) })
              return asJson({ ok: true, ...result })
            }
            const space = resolveSpace(args, exec)
            const result = await operations.execute({ op: 'rebind-space', space: space.id })
            return asJson({ ok: true, ...result })
          }
          case 'chat': {
            const result = await operations.execute({ op: 'create-chat', name: args.name === undefined ? undefined : String(args.name) })
            return asJson({ ok: true, ...result, hint: '对话目录已登记为核心工作区，可直接从该绑定创建会话' })
          }
          case 'chatdrop': {
            const ref = args.target ?? args.name
            if (!ref)
              return asJson({ ok: false, error: 'chatdrop 需要 target（对话路径或目录名）' })
            const result = await operations.execute({ op: 'drop-chat', ref: String(ref) })
            return asJson({ ok: true, ...result, note: '只删除附加记录；目录与核心工作区未动' })
          }
          case 'drop': {
            const ref = args.target ?? args.space ?? args.name
            if (!ref)
              return asJson({ ok: false, error: 'drop 需要工作区引用（target/space/name 任一）' })
            const result = await operations.execute({ op: 'drop-space', space: String(ref) })
            return asJson({ ok: true, ...result, note: '只删除附加记录；核心工作区、壳目录与成员文件未动' })
          }
          default:
            return asJson({ ok: false, error: `未知动作：${action || '(空)'}` })
        }
      }
      catch (error) {
        return asJson({ ok: false, error: (error as Error).message })
      }
    },
  }))
}
