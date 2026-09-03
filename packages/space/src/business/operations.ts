import type { Logger } from '../shared/log.ts'
import type { SpaceStore } from '../store/settings.ts'
import type { WorkspaceService } from '../workspace/core.ts'
import type { ChatData, ChatView, RegistrySnapshot, SpaceData, SpaceSettings, SpaceView, WorkspaceView } from './types.ts'
import { readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { canonicalize } from '../shared/fs-path.ts'
import { assertDirectoryName, chatsDir, ensureDirectory, localDateName, slugify, spacesDir } from '../shared/paths.ts'
import { chatTitle, createChatDirectory } from './chat.ts'
import { descriptionsOf, projectDescriptions } from './lookup.ts'
import { addMemberData, ensureMemberLink, existingDirectory, findMember, memberData, removeMemberData, removeMemberLink, updateMember } from './member.ts'

export type SpaceOperation
  = { op: 'create-space', name: string, folder?: string, mode?: 'reference' | 'link', linkName?: string, title?: string, description?: string }
    | { op: 'enhance-space', workspace: string }
    | { op: 'attach', workspace: string, target: string, mode?: 'reference' | 'link', linkName?: string, title?: string, description?: string }
    | { op: 'detach', workspace: string, target: string }
    | { op: 'primary', workspace: string, target: string }
    | { op: 'title', workspace: string, target: string, value: string }
    | { op: 'description', workspace: string, target: string, value: string }
    | { op: 'create-chat', name?: string }
    | { op: 'drop-space', workspace: string }
    | { op: 'drop-chat', workspace: string }

export interface SpaceOperations {
  snapshot: () => RegistrySnapshot
  execute: (operation: SpaceOperation) => Promise<Record<string, unknown>>
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function coreMatch(rows: WorkspaceView[], reference: string): WorkspaceView {
  const value = reference.trim()
  const matches = rows.filter(row => row.workspaceId === value || row.path === value || row.title === value)
  if (matches.length === 1)
    return matches[0]!
  if (matches.length > 1)
    throw new Error(`核心工作区引用「${reference}」不唯一，请使用 workspaceId 或完整路径`)
  throw new Error(`没有核心工作区「${reference}」`)
}

function descriptionMatch(settings: SpaceSettings, reference: string): { kind: 'space', value: SpaceData } | { kind: 'chat', value: ChatData } {
  const value = reference.trim()
  const space = settings.spaces.find(item => item.workspaceId === value)
  if (space)
    return { kind: 'space', value: space }
  const chat = settings.chats.find(item => item.workspaceId === value)
  if (chat)
    return { kind: 'chat', value: chat }
  throw new Error(`没有插件工作区描述「${reference}」`)
}

class SpaceOperationsImpl implements SpaceOperations {
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly store: SpaceStore,
    private readonly workspaces: WorkspaceService,
    private readonly log: Logger = message => console.warn(message),
  ) {}

  snapshot(): RegistrySnapshot {
    const settings = this.store.read()
    const workspaces = this.workspaces.list()
    return {
      root: this.store.root(),
      workspaces: clone(workspaces),
      ...clone(projectDescriptions(workspaces, descriptionsOf(settings.spaces, settings.chats))),
    }
  }

  execute(operation: SpaceOperation): Promise<Record<string, unknown>> {
    const result = this.tail.then(async () => this.run(operation), async () => this.run(operation))
    this.tail = result.then(() => {}, () => {})
    return result
  }

  private async save(next: SpaceSettings): Promise<void> {
    await this.store.replace(clone(next))
  }

  private async run(operation: SpaceOperation): Promise<Record<string, unknown>> {
    const current = this.store.read()
    switch (operation.op) {
      case 'create-space': return this.createSpace(current, operation)
      case 'enhance-space': return this.enhanceSpace(current, operation.workspace)
      case 'attach': return this.attach(current, operation)
      case 'detach': return this.detach(current, operation)
      case 'primary': return this.primary(current, operation)
      case 'title': return this.memberTitle(current, operation)
      case 'description': return this.memberDescription(current, operation)
      case 'create-chat': return this.createChat(current, operation.name)
      case 'drop-space': return this.drop(current, operation.workspace, 'space')
      case 'drop-chat': return this.drop(current, operation.workspace, 'chat')
    }
  }

  private async createSpace(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'create-space' }>): Promise<Record<string, unknown>> {
    const name = assertDirectoryName(operation.name)
    let memberInput: SpaceData['members'][number] | undefined
    if (operation.folder) {
      const memberPath = await existingDirectory(operation.folder)
      memberInput = memberData({ ...operation, path: memberPath }, memberPath)
    }
    else if (operation.mode !== undefined || operation.linkName !== undefined || operation.title !== undefined || operation.description !== undefined) {
      throw new Error('成员选项必须与 folder 一起提交')
    }
    const target = join(spacesDir(this.store.root()), name)
    const existingPath = await canonicalize(target)
    const path = existingPath ?? target
    const existingCore = existingPath
      ? await this.workspaces.resolveByPath(existingPath)
      : this.workspaces.list().find(row => row.path === target)
    if (existingPath && existingCore)
      throw new Error(`目录已有普通核心工作区「${existingCore.title}」，请使用显式增强操作`)
    if (existingCore) {
      if (current.spaces.some(space => space.workspaceId === existingCore.workspaceId))
        throw new Error(`工作区「${existingCore.title}」已存在`)
    }
    const createdDirectory = existingPath === undefined
    await ensureDirectory(path)
    let core: WorkspaceView
    try {
      core = existingCore ?? await this.workspaces.create(path, name)
    }
    catch (error) {
      if (createdDirectory)
        await removeEmptyDirectory(path)
      throw error
    }
    let member: SpaceData['members'][number] | undefined
    let createdLink = false
    try {
      if (memberInput) {
        member = memberInput
        createdLink = await ensureMemberLink(core.path, member)
      }
      const space: SpaceData = { workspaceId: core.workspaceId, ...(member ? { primary: member.path } : {}), members: member ? [member] : [] }
      await this.save({ ...clone(current), spaces: [...current.spaces, space] })
      return { space: this.spaceView(core, space) }
    }
    catch (error) {
      if (createdLink && member)
        await removeMemberLink(core.path, member).catch(cleanupError => this.log(`[dsh-space] 清理未登记成员链接失败：${(cleanupError as Error).message}`))
      throw error
    }
  }

  private async enhanceSpace(current: SpaceSettings, reference: string): Promise<Record<string, unknown>> {
    const core = coreMatch(this.workspaces.list(), reference)
    if (current.spaces.some(space => space.workspaceId === core.workspaceId) || current.chats.some(chat => chat.workspaceId === core.workspaceId))
      throw new Error(`核心工作区「${core.title}」已经有插件描述`)
    const space: SpaceData = { workspaceId: core.workspaceId, members: [] }
    await this.save({ ...clone(current), spaces: [...current.spaces, space] })
    return { space: this.spaceView(core, space), enhanced: true }
  }

  private async attach(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'attach' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const core = this.requireCore(space.workspaceId)
    const path = await existingDirectory(operation.target)
    const member = memberData({ ...operation, path }, path)
    const nextSpace = addMemberData(space, member)
    const createdLink = await ensureMemberLink(core.path, member)
    try {
      await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, nextSpace) })
    }
    catch (error) {
      if (createdLink)
        await removeMemberLink(core.path, member).catch(cleanupError => this.log(`[dsh-space] 清理未登记成员链接失败：${(cleanupError as Error).message}`))
      throw error
    }
    return { member, primary: nextSpace.primary }
  }

  private async detach(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'detach' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const core = this.requireCore(space.workspaceId)
    const member = findMember(space, operation.target)
    const nextSpace = removeMemberData(space, member)
    await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, nextSpace) })
    await removeMemberLink(core.path, member).catch(error => this.log(`[dsh-space] 清理成员链接失败：${(error as Error).message}`))
    return { detached: member, primary: nextSpace.primary }
  }

  private async primary(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'primary' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const member = findMember(space, operation.target)
    await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, { ...space, primary: member.path }) })
    return { primary: member.path }
  }

  private async memberTitle(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'title' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const member = findMember(space, operation.target)
    const value = operation.value.trim()
    if (value && space.members.some(item => item !== member && (item.title === value || basename(item.path) === value)))
      throw new Error(`成员显示名与现有成员冲突：${value}`)
    const nextSpace = updateMember(space, member, { title: operation.value })
    await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, nextSpace) })
    return { member: findMember(nextSpace, member.path) }
  }

  private async memberDescription(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'description' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const member = findMember(space, operation.target)
    const nextSpace = updateMember(space, member, { description: operation.value })
    await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, nextSpace) })
    return { member: findMember(nextSpace, member.path) }
  }

  private async createChat(current: SpaceSettings, name?: string): Promise<Record<string, unknown>> {
    const root = this.store.root()
    const basePath = join(chatsDir(root), localDateName(), slugify(name ?? 'new-chat'))
    const knownRow = this.workspaces.list().find(row => row.path === basePath)
    const known = knownRow && await canonicalize(knownRow.path) === undefined ? knownRow : undefined
    let path = basePath
    let core = known
    let createdDirectory = false
    if (core) {
      createdDirectory = await canonicalize(core.path) === undefined
      await ensureDirectory(core.path)
    }
    else {
      const createdPath = await createChatDirectory(root, name)
      path = createdPath.path
      createdDirectory = true
      core = await this.workspaces.resolveByPath(path)
      if (!core) {
        try {
          core = await this.workspaces.create(path, chatTitle(path))
        }
        catch (error) {
          await removeEmptyDirectory(path)
          throw error
        }
      }
    }
    if (current.chats.some(chat => chat.workspaceId === core.workspaceId))
      throw new Error(`对话工作区「${core.title}」已经登记`)
    const chat: ChatData = { workspaceId: core.workspaceId }
    try {
      await this.save({ ...clone(current), chats: [...current.chats, chat] })
    }
    catch (error) {
      if (createdDirectory)
        await removeEmptyDirectory(path)
      throw error
    }
    return { chat: this.chatView(core, chat) }
  }

  private async drop(current: SpaceSettings, reference: string, kind: 'space' | 'chat'): Promise<Record<string, unknown>> {
    const found = descriptionMatch(current, reference)
    if (found.kind !== kind)
      throw new Error(`「${reference}」不是${kind === 'space' ? '多项目' : '对话'}工作区描述`)
    const next = clone(current)
    if (kind === 'space')
      next.spaces = next.spaces.filter(space => space.workspaceId !== found.value.workspaceId)
    else
      next.chats = next.chats.filter(chat => chat.workspaceId !== found.value.workspaceId)
    await this.save(next)
    return { dropped: found.value.workspaceId }
  }

  private requireSpace(settings: SpaceSettings, reference: string): SpaceData {
    const row = coreMatch(this.workspaces.list(), reference)
    const space = settings.spaces.find(item => item.workspaceId === row.workspaceId)
    if (!space)
      throw new Error(`核心工作区「${row.title}」不是多项目工作区，请先执行增强`)
    return space
  }

  private requireCore(workspaceId: string): WorkspaceView {
    const core = this.workspaces.get(workspaceId)
    if (!core)
      throw new Error(`核心工作区已不存在：${workspaceId}`)
    return core
  }

  private spaceView(core: WorkspaceView, space: SpaceData): SpaceView {
    return { ...core, ...space, status: 'ready' }
  }

  private chatView(core: WorkspaceView, chat: ChatData): ChatView {
    return { ...core, ...chat, status: 'ready' as const }
  }
}

function replaceSpace(spaces: SpaceData[], next: SpaceData): SpaceData[] {
  return spaces.map(space => space.workspaceId === next.workspaceId ? next : space)
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length === 0)
      await rm(path, { recursive: false, force: true })
  }
  catch {
    // 目录可能在失败处理期间被其他进程移除
  }
}

export function createSpaceOperations(store: SpaceStore, workspaces: WorkspaceService, log?: Logger): SpaceOperations {
  return new SpaceOperationsImpl(store, workspaces, log)
}
