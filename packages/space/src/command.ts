// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SpacesStore } from './registry.ts'
import type { SandboxModeName, SpaceEntity } from './types.ts'
import type { RefreshWorkspaces } from './workspaces.ts'
import { COMMAND_NAME } from './constants.ts'
import { attachFolder, createSpace, detachFolder, doctorSpace, findSpace, listFolders, setFolderDesc, setFolderTitle, setPrimary } from './ops.ts'
import { resolveByCwd } from './resolve.ts'

const USAGE = `用法：
  /space                       当前空间状态；不在任何空间内时列出全部空间
  /space create <名称> [文件夹]  创建空间（可选同时挂入首个文件夹，自动成为主成员）
  /space attach <路径> [显示名]  挂入文件夹（原地引用，不动磁盘）；cwd 不在空间内时用 /space attach <空间名> <路径>
  /space detach <成员引用>      摘除成员（不删除磁盘文件）
  /space primary <成员引用>     设为主成员
  /space title <成员引用> <显示名>   设置显示名（会出现在空间地图里）
  /space desc <成员引用> <说明>      设置一句话说明
  /space doctor                逐成员诊断（存在性、当前沙盒模式下可写性）

成员引用：路径、显示名或目录名，任一即可定位`

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
  return `- ${space.name}（${space.folders.length} 个成员${space.primary ? `，主成员 ${space.primary}` : ''}）`
}

function renderSpaceDetail(space: SpaceEntity, statuses: Awaited<ReturnType<typeof listFolders>>): string {
  const lines = [
    `空间「${space.name}」`,
    ...(statuses.length > 0
      ? statuses.map((folder) => {
          const missing = folder.health === 'missing' ? '（目录缺失）' : ''
          const primary = folder.path === space.primary ? '（主成员）' : ''
          const title = folder.title ? ` — ${folder.title}` : ''
          const desc = folder.desc ? `：${folder.desc}` : ''
          return `- ${folder.path}${title}${desc}${primary}${missing}`
        })
      : ['（暂无成员，用 /space attach 挂入）']),
  ]
  return lines.join('\n')
}

async function run(ctx: Context, store: SpacesStore, refresh: RefreshWorkspaces, invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  const data = store.list()
  const [sub = 'status', ...rest] = invocation.rawInput.trim().split(/\s+/).filter(Boolean)

  /** cwd 所在空间优先；不在任何空间时，attach 允许首参数是空间名 */
  const currentSpace = (): SpaceEntity | undefined => {
    const hit = cwd ? resolveByCwd(data, cwd) : undefined
    return hit?.space
  }

  switch (sub) {
    case 'status': {
      const space = currentSpace()
      if (space)
        return { kind: 'success', text: renderSpaceDetail(space, await listFolders(space)) }
      return { kind: 'success', text: data.length > 0 ? `全部空间：\n${data.map(formatSpaceLine).join('\n')}` : '还没有任何空间，用 /space create 创建' }
    }
    case 'create': {
      const [name, firstFolder] = rest
      if (!name)
        return { kind: 'error', text: `缺少空间名称。\n${USAGE}` }
      const result = await createSpace(data, name, firstFolder)
      await store.save(result.data)
      refresh()
      return { kind: 'success', text: `空间「${result.space.name}」已创建${result.space.folders.length > 0 ? `，首个成员 ${result.space.folders[0]!.path}（主成员）` : '（暂无成员，用 /space attach 挂入）'}` }
    }
    case 'attach': {
      let space = currentSpace()
      let args = rest
      if (!space) {
        // cwd 不在空间内：首参数须是空间名
        const [spaceName, ...tail] = rest
        if (!spaceName)
          return { kind: 'error', text: USAGE }
        space = findSpace(data, spaceName)
        args = tail
      }
      const [target, ...titleParts] = args
      if (!target)
        return { kind: 'error', text: `缺少路径。\n${USAGE}` }
      const result = await attachFolder(data, space.name, target, { title: titleParts.join(' ') || undefined })
      await store.save(result.data)
      refresh()
      return { kind: 'success', text: `已挂入 ${result.folder.path}${result.folder.title ? `（${result.folder.title}）` : ''}${result.space.primary === result.folder.path ? '，主成员' : ''}` }
    }
    case 'detach':
    case 'primary':
    case 'title':
    case 'desc': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何空间内（这些操作需要会话位于空间成员中）' }
      const [ref, ...textParts] = rest
      if (!ref)
        return { kind: 'error', text: `缺少成员引用。\n${USAGE}` }
      if (sub === 'detach') {
        const result = await detachFolder(data, space.name, ref)
        await store.save(result.data)
        refresh()
        return { kind: 'success', text: `已摘除 ${result.folder.path}（磁盘文件未动）` }
      }
      if (sub === 'primary') {
        const result = await setPrimary(data, space.name, ref)
        await store.save(result.data)
        refresh()
        return { kind: 'success', text: `主成员已设为 ${result.space.primary}` }
      }
      const text = textParts.join(' ')
      if (sub === 'title') {
        const result = await setFolderTitle(data, space.name, ref, text)
        await store.save(result.data)
        refresh()
        return { kind: 'success', text: text ? `已把 ${result.folder.path} 的显示名设为「${result.folder.title}」` : `已清除 ${result.folder.path} 的显示名` }
      }
      const result = await setFolderDesc(data, space.name, ref, text)
      await store.save(result.data)
      refresh()
      return { kind: 'success', text: text ? `已更新 ${result.folder.path} 的说明` : `已清除 ${result.folder.path} 的说明` }
    }
    case 'doctor': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何空间内' }
      const report = await doctorSpace(space, cwd ?? '', resolveMode(ctx, invocation))
      const lines = [
        `沙盒模式：${report.mode}；会话目录：${report.sessionCwd}`,
        ...report.folders.map((folder) => {
          const writability = folder.writability === null ? '未知' : folder.writability === 'writable' ? '可写' : folder.writability === 'partial' ? '仅 cwd 子树可写' : '只读'
          const missing = folder.health === 'missing' ? '（目录缺失）' : ''
          return `- ${folder.path}：读取可用、${writability}${missing}`
        }),
      ]
      return { kind: 'success', text: lines.join('\n') }
    }
    default:
      return { kind: 'error', text: `未知子命令：${sub}\n${USAGE}` }
  }
}

/** 注册用户侧 /space 命令 */
export function registerCommand(ctx: Context, store: SpacesStore, refresh: RefreshWorkspaces): void {
  ctx.commands.register({
    name: COMMAND_NAME,
    description: '多项目空间：创建、挂入文件夹、主成员、诊断',
    input: { hint: USAGE.split('\n').slice(1, 9).map(line => line.trim()).join('；') },
    handler: async (invocation) => {
      try {
        return await run(ctx, store, refresh, invocation)
      }
      catch (error) {
        return { kind: 'error', text: (error as Error).message }
      }
    },
  })
}
