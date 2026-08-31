// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SpacesRegistry } from './registry.ts'
import type { SandboxModeName } from './types.ts'
import { COMMAND_NAME } from './constants.ts'
import { locateSpace } from './locate.ts'
import { doctorSpace, initSpace, listSpace, mountProject, setProjectDesc, unmountProject } from './ops.ts'

const USAGE = `用法：
  /space                 查看当前空间状态
  /space init [名称]     把当前目录初始化为多项目空间
  /space doctor          逐项目诊断（存在性、当前沙盒模式下可写性）
  /space mount <目标> [名称]   挂入项目（git URL 克隆 / 本机目录建链接）
  /space unmount <项目>  解除挂载（不删除磁盘文件）
  /space desc <项目> <说明>    设置一句话项目说明
  /space list-known      列出已登记的全部空间`

function cwdOf(invocation: CommandInvocation): string | undefined {
  return invocation.agent?.session?.header?.cwd
}

function resolveMode(ctx: Context, invocation: CommandInvocation): SandboxModeName | 'unknown' {
  try {
    const sandboxPolicy = ctx.get('sandboxPolicy')
    return sandboxPolicy?.resolve({ session: invocation.agent?.session as never }).mode ?? 'unknown'
  }
  catch {
    return 'unknown'
  }
}

async function run(ctx: Context, registry: SpacesRegistry, invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (!cwd)
    return { kind: 'error', text: '无法确定会话工作目录' }

  const [sub = 'status', ...rest] = invocation.rawInput.trim().split(/\s+/).filter(Boolean)

  if (sub === 'list-known') {
    const known = registry.list()
    return { kind: 'success', text: known.length > 0 ? `已登记空间：\n${known.map(r => `- ${r}`).join('\n')}` : '尚未登记任何空间（在空间内执行 /space init 即自动登记）' }
  }

  if (sub === 'init') {
    const file = await initSpace(cwd, rest.join(' ') || undefined)
    const space = await locateSpace(cwd)
    if (space)
      await registry.add(space.root)
    return { kind: 'success', text: `空间「${file.name}」已建立：space.yaml + projects/。文档体系可让 agent 走 workspace-hub skill 补齐。` }
  }

  const space = await locateSpace(cwd)
  if (!space)
    return { kind: 'error', text: `当前目录不在任何多项目空间内。\n${USAGE}` }

  switch (sub) {
    case 'status': {
      const projects = await listSpace(space.root)
      const lines = [
        `空间「${space.file.name}」（${space.root}）`,
        ...(projects.length > 0
          ? projects.map((p) => {
              const flag = p.health === 'ok' ? '' : p.health === 'missing' ? '（目录缺失）' : '（链接到壳外）'
              return `- ${p.path}${p.title ? ` — ${p.title}` : ''}${p.desc ? `：${p.desc}` : ''}${flag}`
            })
          : ['（暂无成员项目，用 /space mount 挂入）']),
      ]
      return { kind: 'success', text: lines.join('\n') }
    }
    case 'doctor': {
      const report = await doctorSpace(space.root, cwd, resolveMode(ctx, invocation))
      const lines = [
        `沙盒模式：${report.mode}；会话目录：${report.sessionCwd}`,
        ...report.projects.map((p) => {
          const writable = p.writable === null ? '未知' : p.writable ? '可写' : '只读'
          const health = p.health === 'ok' ? '' : p.health === 'missing' ? '、目录缺失' : '、真实路径在壳外'
          return `- ${p.path}：读取可用、${writable}${health}`
        }),
      ]
      return { kind: 'success', text: lines.join('\n') }
    }
    case 'mount': {
      const [target, name] = rest
      if (!target)
        return { kind: 'error', text: `缺少目标。\n${USAGE}` }
      const project = await mountProject(space.root, target, name)
      return { kind: 'success', text: `已挂入 ${project.path}` }
    }
    case 'unmount': {
      const [ref] = rest
      if (!ref)
        return { kind: 'error', text: `缺少项目引用。\n${USAGE}` }
      const removed = await unmountProject(space.root, ref)
      return { kind: 'success', text: `已解除挂载 ${removed.path}（磁盘文件未动）` }
    }
    case 'desc': {
      const [ref, ...descParts] = rest
      if (!ref || descParts.length === 0)
        return { kind: 'error', text: `缺少项目引用或说明。\n${USAGE}` }
      const project = await setProjectDesc(space.root, ref, descParts.join(' '))
      return { kind: 'success', text: `已更新 ${project.path} 的说明` }
    }
    default:
      return { kind: 'error', text: `未知子命令：${sub}\n${USAGE}` }
  }
}

/** 注册用户侧 /space 命令 */
export function registerCommand(ctx: Context, registry: SpacesRegistry): void {
  ctx.commands.register({
    name: COMMAND_NAME,
    description: '多项目空间：查看状态、初始化、挂载项目、诊断',
    input: { hint: USAGE.split('\n').slice(1).map(line => line.trim()).join('；') },
    handler: async (invocation) => {
      try {
        return await run(ctx, registry, invocation)
      }
      catch (error) {
        return { kind: 'error', text: (error as Error).message }
      }
    },
  })
}
