// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { SpacesStore } from './registry.ts'
import type { SandboxModeName, SpaceEntity } from './types.ts'
import type { RefreshWorkspaces } from './workspaces.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_NAME } from './constants.ts'
import { attachFolder, createSpace, detachFolder, doctorSpace, findSpace, listFolders, setFolderDesc, setFolderTitle, setPrimary } from './ops.ts'
import { resolveByCwd } from './resolve.ts'

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

const TOOL_DESCRIPTION = `多项目空间（dsh-space）工具：把若干磁盘文件夹组合为一个命名空间——空间是命名实体，文件夹原地引用（不移动、不复制），创建空间与挂入文件夹是分离的操作。
动作：list（cwd 在空间内时列出该空间成员与磁盘状态，否则列出全部空间）｜ create（创建空间，name 必填，target 可选作首个文件夹）｜ attach（把目录挂入空间，target 为路径，可选 title/desc）｜ detach（摘除成员，不动磁盘）｜ primary（设主成员）｜ title（设显示名）｜ desc（设一句话说明）｜ doctor（逐成员诊断存在性与当前沙盒模式下可写性）。
空间解析：缺省用会话 cwd 所在空间（cwd 落在成员文件夹内即属于该空间）；cwd 不在任何空间时 attach/detach 等动作需用 space 参数指定目标空间。
约束：一个文件夹全局只能属于一个空间；detach 不会删除文件。`

/** 注册模型侧 space 工具 */
export function registerTool(ctx: Context, store: SpacesStore, persist: (spaces: SpaceEntity[]) => Promise<void>, refresh: RefreshWorkspaces): void {
  /** 解析目标空间：显式 space 参数优先，否则 cwd 所在空间 */
  const resolveSpace = (args: { space?: string }, exec: ExecAgentCarrier): SpaceEntity => {
    const data = store.list()
    if (args.space)
      return findSpace(data, args.space)
    const cwd = cwdOf(exec)
    const hit = cwd ? resolveByCwd(data, cwd) : undefined
    if (!hit)
      throw new Error('当前会话目录不属于任何空间，且未指定 space 参数（可用 list 查看全部空间）')
    return hit.space
  }

  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      action: { type: 'string', required: true, description: 'list | create | attach | detach | primary | title | desc | doctor' },
      target: { type: 'string', description: 'attach 的目录路径；detach/primary/title/desc 的成员引用（路径、显示名或目录名）' },
      space: { type: 'string', description: '目标空间（名称或 id）；缺省用会话 cwd 所在空间' },
      name: { type: 'string', description: 'create 的空间名称' },
      title: { type: 'string', description: 'attach/title 的显示名；空串清除' },
      desc: { type: 'string', description: 'attach/desc 的一句话说明；空串清除' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value ?? {}, null, 2) }],
    },
    async execute(args, exec) {
      try {
        const data = store.list()
        const action = String(args.action ?? '')

        switch (action) {
          case 'list': {
            const cwd = cwdOf(exec)
            const hit = cwd ? resolveByCwd(data, cwd) : undefined
            if (!hit)
              return asJson({ ok: true, spaces: data.map(s => ({ id: s.id, name: s.name, primary: s.primary, folders: s.folders })) })
            return asJson({ ok: true, space: hit.space, statuses: await listFolders(hit.space) })
          }
          case 'create': {
            if (!args.name)
              return asJson({ ok: false, error: 'create 需要 name（空间名称）' })
            const result = await createSpace(data, args.name, args.target)
            await persist(result.data)
            refresh()
            return asJson({ ok: true, space: result.space })
          }
          case 'attach': {
            if (!args.target)
              return asJson({ ok: false, error: 'attach 需要 target（目录路径）' })
            const space = resolveSpace(args, exec)
            const result = await attachFolder(data, space.name, args.target, { title: args.title, desc: args.desc })
            await persist(result.data)
            refresh()
            return asJson({ ok: true, folder: result.folder, primary: result.space.primary })
          }
          case 'detach': {
            if (!args.target)
              return asJson({ ok: false, error: 'detach 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await detachFolder(data, space.name, args.target)
            await persist(result.data)
            refresh()
            return asJson({ ok: true, detached: result.folder, note: '仅从空间移除，磁盘文件未动' })
          }
          case 'primary': {
            if (!args.target)
              return asJson({ ok: false, error: 'primary 需要 target（成员引用）' })
            const space = resolveSpace(args, exec)
            const result = await setPrimary(data, space.name, args.target)
            await persist(result.data)
            refresh()
            return asJson({ ok: true, primary: result.space.primary })
          }
          case 'title': {
            const space = resolveSpace(args, exec)
            if (!args.target || args.title === undefined)
              return asJson({ ok: false, error: 'title 需要 target（成员引用）与 title（空串清除）' })
            const result = await setFolderTitle(data, space.name, args.target, args.title)
            await persist(result.data)
            refresh()
            return asJson({ ok: true, folder: result.folder })
          }
          case 'desc': {
            const space = resolveSpace(args, exec)
            if (!args.target || args.desc === undefined)
              return asJson({ ok: false, error: 'desc 需要 target（成员引用）与 desc（空串清除）' })
            const result = await setFolderDesc(data, space.name, args.target, args.desc)
            await persist(result.data)
            refresh()
            return asJson({ ok: true, folder: result.folder })
          }
          case 'doctor': {
            const space = resolveSpace(args, exec)
            const cwd = cwdOf(exec) ?? ''
            return asJson({ ok: true, report: await doctorSpace(space, cwd, resolveMode(ctx, exec)) })
          }
          default:
            return asJson({ ok: false, error: `未知动作：${action || '(空)'}（可用：list | create | attach | detach | primary | title | desc | doctor）` })
        }
      }
      catch (error) {
        return asJson({ ok: false, error: (error as Error).message })
      }
    },
  }))
}
