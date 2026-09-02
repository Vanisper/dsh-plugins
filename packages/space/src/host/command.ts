import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SandboxModeName, SpaceEntity } from '../domain/types.ts'
import type { SpaceOperations } from './operations.ts'
import { auditBinding, auditChat, doctorSpace } from '../domain/doctor.ts'
import { resolveByCwd } from '../domain/resolve.ts'
import { findSpace, listFolders } from '../domain/space.ts'
import { COMMAND_NAME } from '../shared/constants.ts'

const USAGE = `用法：
  /space                          当前工作区状态；不在任何工作区内时列出全部工作区与对话
  /space create <名称> [文件夹] [--link]   创建工作区（建壳、核心登记、附加注册一次完成）
  /space attach <路径> [显示名] [--link]   挂入文件夹（默认 reference 原地引用；--link 壳内 symlink）
  /space detach <成员引用>        摘除成员（真实目录不动；link 成员的壳内 symlink 一并移除）
  /space primary <成员引用>       设为主成员（纯字段，不联动排序）
  /space title <成员引用> <显示名>
  /space desc <成员引用> <说明>
  /space doctor                   逐成员诊断（可写性、链接健康度）+ 绑定与对话审计
  /space rebind [工作区引用]      显式修复工作区核心绑定；缺省修复当前工作区
  /space rebind chat <对话引用>   显式修复对话核心绑定
  /space chat [名字]              建对话（静默建 chats/<日期>/ 下目录并登记绑定）
  /space chatdrop <对话引用>      删对话注册表记录（磁盘不动）
  /space drop <工作区名>          删除工作区附加记录（磁盘不动）

cwd 不在工作区内时 attach 用 /space attach <工作区名> <路径>；成员引用：路径、显示名或目录名任一`

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

function formatSpaceLine(space: SpaceEntity): string {
  return `- ${space.name}（${space.folders.length} 个成员，壳 ${space.shell}${space.primary ? `，主成员 ${space.primary}` : ''}，绑定 ${space.workspaceId}）`
}

function renderSpaceDetail(space: SpaceEntity, statuses: Awaited<ReturnType<typeof listFolders>>): string {
  const lines = [
    `工作区「${space.name}」（壳：${space.shell}），绑定 ${space.workspaceId}`,
    `入口目录：${space.shell}`,
    ...(statuses.length > 0
      ? statuses.map((folder) => {
          const missing = folder.health === 'missing' ? '（目录缺失）' : ''
          const broken = folder.linkHealth === 'broken' ? '（壳内链接失效）' : ''
          const primary = folder.path === space.primary ? '（主成员）' : ''
          const title = folder.title ? ` — ${folder.title}` : ''
          const desc = folder.desc ? `：${folder.desc}` : ''
          const mode = folder.mode === 'link' ? 'link' : 'ref'
          return `- ${folder.path}${title}${desc}${primary} [${mode}]${missing}${broken}`
        })
      : ['（暂无成员，用 /space attach 挂入）']),
  ]
  return lines.join('\n')
}

async function run(ctx: Context, operations: SpaceOperations, invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  const snapshot = operations.snapshot()
  const data = snapshot.spaces
  const chats = snapshot.chats
  const [sub = 'status', ...rest] = invocation.rawInput.trim().split(/\s+/).filter(Boolean)

  const currentSpace = (): SpaceEntity | undefined => {
    return cwd ? resolveByCwd(data, cwd) : undefined
  }

  switch (sub) {
    case 'status': {
      const space = currentSpace()
      if (space)
        return { kind: 'success', text: renderSpaceDetail(space, await listFolders(space)) }
      const chatLines = chats.length > 0 ? [`对话（${chats.length}）：`, ...chats.map(chat => `- ${chat.path}（绑定 ${chat.workspaceId}）`)] : []
      return { kind: 'success', text: data.length > 0 || chats.length > 0 ? `托管根：${snapshot.root}\n全部工作区：\n${data.map(formatSpaceLine).join('\n') || '（无）'}\n${chatLines.join('\n')}` : `还没有任何工作区或对话（托管根：${snapshot.root}），用 /space create 或 /space chat 开始` }
    }
    case 'create': {
      const asLink = rest.includes('--link')
      const [name, firstFolder] = rest.filter(item => item !== '--link')
      if (!name)
        return { kind: 'error', text: `缺少工作区名称。\n${USAGE}` }
      if (asLink && !firstFolder)
        return { kind: 'error', text: '--link 需要同时提供首成员文件夹' }
      const result = await operations.execute({ op: 'create-space', name, folder: firstFolder, mode: asLink ? 'link' : undefined })
      const space = result.space as SpaceEntity
      return { kind: 'success', text: `工作区「${space.name}」已创建，壳目录：${space.shell}（核心工作区 ${space.workspaceId}）` }
    }
    case 'attach': {
      const asLink = rest.includes('--link')
      const args = rest.filter(item => item !== '--link')
      let space = currentSpace()
      if (!space) {
        // cwd 不在工作区内：首参数须是工作区名
        const [spaceName, ...tail] = args
        if (!spaceName)
          return { kind: 'error', text: USAGE }
        space = findSpace(data, spaceName)
        args.splice(0, args.length, ...tail)
      }
      const [target, ...titleParts] = args
      if (!target)
        return { kind: 'error', text: `缺少路径。\n${USAGE}` }
      const result = await operations.execute({ op: 'attach', space: space.name, target, mode: asLink ? 'link' : undefined, title: titleParts.join(' ') || undefined })
      const folder = result.folder as SpaceEntity['folders'][number]
      const mode = folder.mode === 'link' ? `，壳内链接 ${folder.linkPath}` : '（原地引用）'
      return { kind: 'success', text: `已挂入 ${folder.path}${folder.title ? `（${folder.title}）` : ''}${mode}${result.primary === folder.path ? '，主成员' : ''}` }
    }
    case 'detach':
    case 'primary':
    case 'title':
    case 'desc': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何工作区壳目录内（这些操作需要会话位于工作区入口子树中）' }
      const [ref, ...textParts] = rest
      if (!ref)
        return { kind: 'error', text: `缺少成员引用。\n${USAGE}` }
      if (sub === 'detach') {
        const result = await operations.execute({ op: 'detach', space: space.name, target: ref })
        const folder = result.detached as SpaceEntity['folders'][number]
        return { kind: 'success', text: `已摘除 ${folder.path}（真实目录未动）` }
      }
      if (sub === 'primary') {
        const result = await operations.execute({ op: 'primary', space: space.name, target: ref })
        return { kind: 'success', text: `主成员已设为 ${result.primary}；壳目录与会话归组保持不变` }
      }
      const text = textParts.join(' ')
      if (sub === 'title') {
        const result = await operations.execute({ op: 'title', space: space.name, target: ref, value: text })
        const folder = result.folder as SpaceEntity['folders'][number]
        return { kind: 'success', text: text ? `已把 ${folder.path} 的显示名设为「${folder.title}」` : `已清除 ${folder.path} 的显示名` }
      }
      const result = await operations.execute({ op: 'desc', space: space.name, target: ref, value: text })
      const folder = result.folder as SpaceEntity['folders'][number]
      return { kind: 'success', text: text ? `已更新 ${folder.path} 的说明` : `已清除 ${folder.path} 的说明` }
    }
    case 'doctor': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何工作区内' }
      const report = await doctorSpace(space, cwd ?? '', resolveMode(ctx, invocation))
      const rows = operations.coreRows()
      const binding = auditBinding(space, rows, data)
      const shellLine = report.shellHealth === 'ok'
        ? `壳目录：${space.shell}（存在）`
        : `壳目录：${space.shell}（磁盘缺失）`
      const chatLines = await Promise.all(chats.map(async (chat) => {
        const audit = await auditChat(chat, rows)
        return `- ${chat.path}：${audit.detail}`
      }))
      const lines = [
        `沙盒模式：${report.mode}；会话目录：${report.sessionCwd}`,
        shellLine,
        `工作区绑定：${binding.detail}`,
        ...report.folders.map((folder) => {
          const writability = folder.writability === null ? '未知' : folder.writability === 'writable' ? '可写' : folder.writability === 'partial' ? '仅 cwd 子树可写' : '只读'
          const missing = folder.health === 'missing' ? '、目录缺失' : ''
          const broken = folder.linkHealth === 'broken' ? '、壳内链接失效' : ''
          return `- ${folder.path}：读取可用、${writability}${missing}${broken}`
        }),
        ...(chatLines.length > 0 ? ['对话实体：', ...chatLines] : []),
      ]
      return { kind: 'success', text: lines.join('\n') }
    }
    case 'rebind': {
      if (rest[0] === 'chat') {
        const ref = rest[1]
        if (!ref)
          return { kind: 'error', text: `缺少对话引用。\n${USAGE}` }
        const result = await operations.execute({ op: 'rebind-chat', chat: ref })
        return { kind: 'success', text: result.healed ? `对话绑定已修复为 ${result.workspaceId}` : `对话绑定 ${result.workspaceId} 无需修复` }
      }
      const space = rest[0] ? findSpace(data, rest[0]) : currentSpace()
      if (!space)
        return { kind: 'error', text: `当前目录不在工作区壳目录内，请显式提供工作区引用。\n${USAGE}` }
      const result = await operations.execute({ op: 'rebind-space', space: space.id })
      return { kind: 'success', text: result.healed ? `工作区「${space.name}」绑定已修复为 ${result.workspaceId}` : `工作区「${space.name}」绑定 ${result.workspaceId} 无需修复` }
    }
    case 'chat': {
      const result = await operations.execute({ op: 'create-chat', name: rest.join(' ') || undefined })
      const chat = result.chat as typeof chats[number]
      return { kind: 'success', text: `对话目录：${chat.path}（核心工作区 ${chat.workspaceId}）` }
    }
    case 'chatdrop': {
      const [ref] = rest
      if (!ref)
        return { kind: 'error', text: `缺少对话引用。\n${USAGE}` }
      const result = await operations.execute({ op: 'drop-chat', ref })
      return { kind: 'success', text: `已删除对话记录 ${String(result.dropped)}（目录与核心行未动）` }
    }
    case 'drop': {
      const [ref] = rest
      if (!ref)
        return { kind: 'error', text: `缺少工作区名。\n${USAGE}` }
      const space = findSpace(data, ref)
      await operations.execute({ op: 'drop-space', space: ref })
      return { kind: 'success', text: `已删除工作区「${space.name}」的附加注册表记录（核心工作区、壳目录与成员文件均未动，可手工清理 ${space.shell}）` }
    }
    default:
      return { kind: 'error', text: `未知子命令：${sub}\n${USAGE}` }
  }
}

/** 注册用户侧 /space 命令 */
export function registerCommand(ctx: Context, operations: SpaceOperations): void {
  ctx.commands.register({
    name: COMMAND_NAME,
    description: '多项目工作区：创建、挂入文件夹、主成员、诊断与对话目录',
    input: { hint: USAGE.split('\n').slice(1, 14).map(line => line.trim()).join('；') },
    handler: async (invocation) => {
      try {
        return await run(ctx, operations, invocation)
      }
      catch (error) {
        return { kind: 'error', text: (error as Error).message }
      }
    },
  })
}
