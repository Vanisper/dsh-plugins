// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { SpacesRegistry } from './registry.ts'
import type { SandboxModeName } from './types.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_NAME } from './constants.ts'
import { locateSpace } from './locate.ts'
import { doctorSpace, initSpace, listSpace, mountProject, setProjectDesc, unmountProject } from './ops.ts'

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

const NOT_IN_SPACE = '当前会话目录不在任何多项目空间内（向上未找到 space.yaml）。可先用 action=init 把当前目录初始化为空间。'

const TOOL_DESCRIPTION = `多项目空间（dsh-space）工具：以「壳工作空间」组织多个项目仓库——壳根承载 space.yaml 与文档，项目挂在 projects/ 下、git 各自独立。
动作：list（列出当前空间的成员项目与磁盘状态）｜ init（把当前会话目录初始化为空间，可选 name）｜ mount（把 git URL 或本机目录挂入当前空间 projects/，可选 name）｜ unmount（按 path/title 解除挂载，绝不删除磁盘文件）｜ setdesc（设置项目的一句话说明，会出现在空间地图里）｜ doctor（逐项目诊断存在性与当前沙盒模式下的可写性）。
约束：init 作用于会话当前目录；其余动作要求会话目录已在某空间内。unmount 不会删除文件。`

/** 注册模型侧 space 工具 */
export function registerTool(ctx: Context, registry: SpacesRegistry): void {
  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      action: { type: 'string', required: true, description: 'list | init | mount | unmount | setdesc | doctor' },
      target: { type: 'string', description: 'mount 的目标（git URL 或本机目录路径）；unmount/setdesc 的项目引用（path、title 或目录名）' },
      name: { type: 'string', description: '可选：init 的空间名、mount 的项目目录名' },
      desc: { type: 'string', description: 'setdesc 的一句话项目说明' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value ?? {}, null, 2) }],
    },
    async execute(args, exec) {
      try {
        const cwd = cwdOf(exec)
        if (!cwd)
          return asJson({ ok: false, error: '无法确定会话工作目录' })
        const action = String(args.action ?? '')

        if (action === 'init') {
          const file = await initSpace(cwd, args.name)
          const root = (await locateSpace(cwd))?.root
          if (root)
            await registry.add(root)
          return asJson({ ok: true, space: { root, name: file.name }, hint: '骨架已建：space.yaml + projects/。文档体系（README/docs/AGENTS.md）可由 workspace-hub skill 补齐。' })
        }

        const space = await locateSpace(cwd)
        if (!space)
          return asJson({ ok: false, error: NOT_IN_SPACE })

        switch (action) {
          case 'list':
            return asJson({ ok: true, space: { root: space.root, name: space.file.name }, projects: await listSpace(space.root) })
          case 'doctor':
            return asJson({ ok: true, report: await doctorSpace(space.root, cwd, resolveMode(ctx, exec)) })
          case 'mount': {
            if (!args.target)
              return asJson({ ok: false, error: 'mount 需要 target（git URL 或本机目录路径）' })
            const project = await mountProject(space.root, args.target, args.name)
            return asJson({ ok: true, mounted: project })
          }
          case 'unmount': {
            if (!args.target)
              return asJson({ ok: false, error: 'unmount 需要项目引用（path、title 或目录名）' })
            const removed = await unmountProject(space.root, args.target)
            return asJson({ ok: true, unmounted: removed, note: '仅从 space.yaml 移除，磁盘文件未动' })
          }
          case 'setdesc': {
            if (!args.target || args.desc === undefined)
              return asJson({ ok: false, error: 'setdesc 需要 target（项目引用）与 desc' })
            const project = await setProjectDesc(space.root, args.target, args.desc)
            return asJson({ ok: true, project })
          }
          default:
            return asJson({ ok: false, error: `未知动作：${action || '(空)'}（可用：list | init | mount | unmount | setdesc | doctor）` })
        }
      }
      catch (error) {
        return asJson({ ok: false, error: (error as Error).message })
      }
    },
  }))
}
