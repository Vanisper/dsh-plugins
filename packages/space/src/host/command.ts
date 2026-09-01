import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SandboxModeName, SpaceEntity } from '../domain/types.ts'
import type { SpacesStore } from '../store/spaces.ts'
import { bindChatWorkspaceId, createChat, dropChat } from '../domain/chats.ts'
import { auditBinding, auditChat, doctorSpace } from '../domain/doctor.ts'
import { resolveByCwd } from '../domain/resolve.ts'
import { attachFolder, bindWorkspaceId, createSpace, detachFolder, dropSpace, effectivePath, findSpace, listFolders, setFolderDesc, setFolderTitle, setPrimary } from '../domain/space.ts'
import { COMMAND_NAME } from '../shared/constants.ts'
import { coreRows, registerCoreWorkspace } from './core-workspace.ts'

const USAGE = `用法：
  /space                          当前空间状态；不在任何空间内时列出全部空间与对话
  /space create <名称> [文件夹]   创建空间（托管根下建壳目录并登记绑定；可选同时挂入首个成员）
  /space attach <路径> [显示名] [--link]   挂入文件夹（默认 reference 原地引用；--link 壳内 symlink）
  /space detach <成员引用>        摘除成员（真实目录不动；link 成员的壳内 symlink 一并移除）
  /space primary <成员引用>       设为主成员（纯字段，不联动排序）
  /space title <成员引用> <显示名>
  /space desc <成员引用> <说明>
  /space doctor                   逐成员诊断（可写性、链接健康度）+ 绑定与对话审计
  /space chat [名字]              建对话（静默建 chats/<日期>/ 下目录并登记绑定）
  /space chatdrop <对话引用>      删对话注册表记录（磁盘不动）
  /space drop <空间名>            删除空间注册表记录（磁盘不动）

cwd 不在空间内时 attach 用 /space attach <空间名> <路径>；成员引用：路径、显示名或目录名任一`

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

const warn = (message: string): void => console.warn(message)

function formatSpaceLine(space: SpaceEntity): string {
  return `- ${space.name}（${space.folders.length} 个成员${space.shell ? `，壳 ${space.shell}` : ''}${space.primary ? `，主成员 ${space.primary}` : ''}${space.workspaceId ? `，已绑定 ${space.workspaceId}` : '，未绑定'}）`
}

function renderSpaceDetail(space: SpaceEntity, statuses: Awaited<ReturnType<typeof listFolders>>): string {
  const lines = [
    `空间「${space.name}」${space.shell ? `（壳：${space.shell}）` : '（无壳）'}${space.workspaceId ? `，绑定 ${space.workspaceId}` : '，未绑定'}`,
    `入口目录：${effectivePath(space) ?? '（无——纯注解合集）'}`,
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

async function run(ctx: Context, store: SpacesStore, invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  const data = store.listSpaces()
  const chats = store.listChats()
  const [sub = 'status', ...rest] = invocation.rawInput.trim().split(/\s+/).filter(Boolean)

  const currentSpace = (): SpaceEntity | undefined => {
    return cwd ? resolveByCwd(data, cwd) : undefined
  }

  switch (sub) {
    case 'status': {
      const space = currentSpace()
      if (space)
        return { kind: 'success', text: renderSpaceDetail(space, await listFolders(space)) }
      const chatLines = chats.length > 0 ? [`对话（${chats.length}）：`, ...chats.map(chat => `- ${chat.path}${chat.workspaceId ? '' : '（未绑定）'}`)] : []
      return { kind: 'success', text: data.length > 0 || chats.length > 0 ? `托管根：${store.root()}\n全部空间：\n${data.map(formatSpaceLine).join('\n') || '（无）'}\n${chatLines.join('\n')}` : `还没有任何空间或对话（托管根：${store.root()}），用 /space create 或 /space chat 开始` }
    }
    case 'create': {
      const [name, firstFolder] = rest
      if (!name)
        return { kind: 'error', text: `缺少空间名称。\n${USAGE}` }
      const result = await createSpace(data, name, store.root(), firstFolder)
      const workspaceId = await registerCoreWorkspace(ctx, result.space.shell!, result.space.name, warn)
      const bound = workspaceId
        ? bindWorkspaceId(result.data, result.space.name, workspaceId)
        : { data: result.data, space: findSpace(result.data, result.space.name) }
      await store.save(bound.data, chats)
      return { kind: 'success', text: `空间「${bound.space.name}」已创建，壳目录：${bound.space.shell}${workspaceId ? `（已绑定核心工作区 ${workspaceId}）` : '（核心登记未就绪，绑定待补——doctor 会提示）'}` }
    }
    case 'attach': {
      const asLink = rest.includes('--link')
      const args = rest.filter(item => item !== '--link')
      let space = currentSpace()
      if (!space) {
        // cwd 不在空间内：首参数须是空间名
        const [spaceName, ...tail] = args
        if (!spaceName)
          return { kind: 'error', text: USAGE }
        space = findSpace(data, spaceName)
        args.splice(0, args.length, ...tail)
      }
      const [target, ...titleParts] = args
      if (!target)
        return { kind: 'error', text: `缺少路径。\n${USAGE}` }
      const result = await attachFolder(data, space.name, target, {
        mode: asLink ? 'link' : undefined,
        title: titleParts.join(' ') || undefined,
      })
      await store.save(result.data, chats)
      const mode = result.folder.mode === 'link' ? `，壳内链接 ${result.folder.linkPath}` : '（原地引用）'
      return { kind: 'success', text: `已挂入 ${result.folder.path}${result.folder.title ? `（${result.folder.title}）` : ''}${mode}${result.space.primary === result.folder.path ? '，主成员' : ''}` }
    }
    case 'detach':
    case 'primary':
    case 'title':
    case 'desc': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何空间的有效路径内（这些操作需要会话位于空间入口目录子树中）' }
      const [ref, ...textParts] = rest
      if (!ref)
        return { kind: 'error', text: `缺少成员引用。\n${USAGE}` }
      if (sub === 'detach') {
        const result = await detachFolder(data, space.name, ref)
        await store.save(result.data, chats)
        return { kind: 'success', text: `已摘除 ${result.folder.path}（真实目录未动）` }
      }
      if (sub === 'primary') {
        const result = await setPrimary(data, space.name, ref)
        await store.save(result.data, chats)
        return { kind: 'success', text: `主成员已设为 ${result.space.primary}（纯字段标记，不联动排序）` }
      }
      const text = textParts.join(' ')
      if (sub === 'title') {
        const result = await setFolderTitle(data, space.name, ref, text)
        await store.save(result.data, chats)
        return { kind: 'success', text: text ? `已把 ${result.folder.path} 的显示名设为「${result.folder.title}」` : `已清除 ${result.folder.path} 的显示名` }
      }
      const result = await setFolderDesc(data, space.name, ref, text)
      await store.save(result.data, chats)
      return { kind: 'success', text: text ? `已更新 ${result.folder.path} 的说明` : `已清除 ${result.folder.path} 的说明` }
    }
    case 'doctor': {
      const space = currentSpace()
      if (!space)
        return { kind: 'error', text: '当前目录不在任何空间内' }
      const report = await doctorSpace(space, cwd ?? '', resolveMode(ctx, invocation))
      const rows = coreRows(ctx)
      const binding = auditBinding(space, rows, data)
      const shellLine = report.shellHealth === 'none'
        ? '壳目录：无（无壳形态，有效路径走主成员/首位成员）'
        : report.shellHealth === 'ok'
          ? `壳目录：${space.shell}（存在）`
          : `壳目录：${space.shell}（磁盘缺失——注册表结构仍在，link 成员可推导重建，非派生文档需自行恢复）`
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
    case 'chat': {
      const result = await createChat(chats, store.root(), rest.join(' ') || undefined)
      const slug = result.chat.path.split('/').pop() ?? result.chat.path
      const workspaceId = await registerCoreWorkspace(ctx, result.chat.path, slug, warn)
      const bound = workspaceId
        ? bindChatWorkspaceId(result.data, result.chat.path, workspaceId)
        : { data: result.data, chat: result.chat }
      await store.save(data, bound.data)
      return { kind: 'success', text: `对话目录：${bound.chat.path}${workspaceId ? `（已绑定核心工作区 ${workspaceId}）` : '（核心登记未就绪——doctor 会提示）'}` }
    }
    case 'chatdrop': {
      const [ref] = rest
      if (!ref)
        return { kind: 'error', text: `缺少对话引用。\n${USAGE}` }
      const result = await dropChat(chats, ref)
      await store.save(data, result.data)
      return { kind: 'success', text: `已删除对话记录 ${result.chat.path}（目录与核心行未动）` }
    }
    case 'drop': {
      const [ref] = rest
      if (!ref)
        return { kind: 'error', text: `缺少空间名。\n${USAGE}` }
      const result = dropSpace(data, ref)
      await store.save(result.data, chats)
      return { kind: 'success', text: `已删除空间「${result.space.name}」的注册表记录（壳目录与成员文件均未动${result.space.shell ? `，可手工清理 ${result.space.shell}` : ''}）` }
    }
    default:
      return { kind: 'error', text: `未知子命令：${sub}\n${USAGE}` }
  }
}

/** 注册用户侧 /space 命令 */
export function registerCommand(ctx: Context, store: SpacesStore): void {
  ctx.commands.register({
    name: COMMAND_NAME,
    description: '多项目空间：创建、挂入文件夹、主成员、诊断、对话与临时目录',
    input: { hint: USAGE.split('\n').slice(1, 12).map(line => line.trim()).join('；') },
    handler: async (invocation) => {
      try {
        return await run(ctx, store, invocation)
      }
      catch (error) {
        return { kind: 'error', text: (error as Error).message }
      }
    },
  })
}
