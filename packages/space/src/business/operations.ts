import type { Logger } from '../shared/log.ts'
import type { SpaceStore } from '../store/settings.ts'
import type { WorkspaceService } from '../workspace/core.ts'
import type { ChatData, ChatView, RegistrySnapshot, SpaceData, SpaceSettings, SpaceView, WorkspaceView } from './types.ts'
import { readdir, rmdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { canonicalize, isUnder } from '../shared/fs-path.ts'
import { assertDirectoryName, chatsDir, ensureDirectory, localDateName, slugify, spacesDir } from '../shared/paths.ts'
import { finishPendingCreation, readPendingCreation, savePendingCreation, startPendingCreation } from '../store/pending.ts'
import { chatTitle } from './chat.ts'
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
    | { op: 'update-member', workspace: string, target: string, title: string, description: string }
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
  const exact = rows.find(row => row.workspaceId === value) ?? rows.find(row => row.path === value)
  if (exact)
    return exact
  const matches = rows.filter(row => row.title === value)
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

  private async coreByPath(path: string): Promise<WorkspaceView | undefined> {
    const canonicalPath = await canonicalize(path) ?? resolve(path)
    const direct = await this.workspaces.resolveByPath(canonicalPath).catch((error: NodeJS.ErrnoException) => {
      // 核心查询要求目录存在；创建前和目录暂时缺失时仍需检查已有登记
      if (error.code !== 'ENOENT')
        throw error
      return undefined
    })
    if (direct)
      return direct
    for (const row of this.workspaces.list()) {
      const rowPath = await canonicalize(row.path) ?? resolve(row.path)
      if (rowPath === canonicalPath)
        return row
    }
  }

  private async samePath(left: string, right: string): Promise<boolean> {
    const leftPath = await canonicalize(left) ?? resolve(left)
    const rightPath = await canonicalize(right) ?? resolve(right)
    return leftPath === rightPath
  }

  private async availableChatPath(basePath: string): Promise<string> {
    let suffix = 1
    while (true) {
      const candidate = suffix === 1 ? basePath : `${basePath}-${suffix}`
      if (!await canonicalize(candidate) && !await this.coreByPath(candidate))
        return candidate
      suffix += 1
    }
  }

  private async validatePendingPath(kind: 'space' | 'chat', key: string, path: string): Promise<void> {
    const expectedParent = await canonicalize(dirname(key)) ?? resolve(dirname(key))
    const target = await canonicalize(path) ?? resolve(path)
    if (!isUnder(target, expectedParent) || dirname(target) !== expectedParent)
      throw new Error(`创建凭据中的路径超出托管目录：${path}`)
    if (kind === 'space' && basename(target) !== basename(key))
      throw new Error(`Space 创建凭据与请求名称不匹配：${path}`)
    const base = basename(key)
    if (kind === 'chat' && basename(target) !== base && !new RegExp(`^${escapeRegExp(base)}-(?:[2-9]|[1-9]\\d+)$`).test(basename(target)))
      throw new Error(`Chat 创建凭据与请求名称不匹配：${path}`)
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
      case 'update-member': return this.updateMemberDetails(current, operation)
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
    let pending = await readPendingCreation(target, 'space')
    if (pending)
      await this.validatePendingPath('space', target, pending.path)
    const existingPath = await canonicalize(target)
    if (!pending) {
      const existingCore = await this.coreByPath(existingPath ?? target)
      if (existingCore)
        throw new Error(`目录已有普通核心工作区「${existingCore.title}」，请使用显式增强操作`)
      if (existingPath)
        throw new Error(`目录已存在但不是插件创建的工作区：${existingPath}`)
      pending = await startPendingCreation(target, 'space')
    }
    const pendingWorkspaceId = pending.workspaceId
    const described = pendingWorkspaceId && current.spaces.some(space => space.workspaceId === pendingWorkspaceId)
    if (described) {
      await finishPendingCreation(target)
      throw new Error(`工作区已经存在：${name}`)
    }
    const createdDirectory = existingPath === undefined
    await ensureDirectory(target)
    const path = (await canonicalize(target)) ?? target
    if (pending.path !== path) {
      pending = { ...pending, path }
      await savePendingCreation(target, pending)
    }
    let core: WorkspaceView
    const recordedCore = pending.workspaceId ? this.workspaces.get(pending.workspaceId) : undefined
    if (recordedCore && !await this.samePath(recordedCore.path, pending.path))
      throw new Error(`创建凭据指向的核心工作区路径已变化：${recordedCore.workspaceId}`)
    const existingCore = recordedCore ?? await this.coreByPath(path)
    try {
      core = existingCore ?? await this.workspaces.create(path, name)
    }
    catch (error) {
      if (createdDirectory && await removeEmptyDirectory(path))
        await finishPendingCreation(target)
      throw error
    }
    pending = { ...pending, path: core.path, workspaceId: core.workspaceId }
    await savePendingCreation(target, pending)
    let member: SpaceData['members'][number] | undefined
    let createdLink = false
    try {
      if (memberInput) {
        member = memberInput
        createdLink = await ensureMemberLink(core.path, member)
      }
      const space: SpaceData = { workspaceId: core.workspaceId, ...(member ? { primary: member.path } : {}), members: member ? [member] : [] }
      await this.save({ ...clone(current), spaces: [...current.spaces, space] })
      await finishPendingCreation(target).catch(error => this.log(`[dsh-space] 清理已完成创建凭据失败：${(error as Error).message}`))
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

  private async updateMemberDetails(current: SpaceSettings, operation: Extract<SpaceOperation, { op: 'update-member' }>): Promise<Record<string, unknown>> {
    const space = this.requireSpace(current, operation.workspace)
    const member = findMember(space, operation.target)
    const nextSpace = updateMember(space, member, { title: operation.title, description: operation.description })
    await this.save({ ...clone(current), spaces: replaceSpace(current.spaces, nextSpace) })
    return { member: findMember(nextSpace, member.path) }
  }

  private async createChat(current: SpaceSettings, name?: string): Promise<Record<string, unknown>> {
    const root = this.store.root()
    const basePath = join(chatsDir(root), localDateName(), slugify(name ?? 'new-chat'))
    const key = basePath
    let pending = await readPendingCreation(key, 'chat')
    let target: string
    let createdDirectory = false
    if (!pending) {
      target = await this.availableChatPath(basePath)
      pending = await startPendingCreation(key, 'chat', target)
    }
    else {
      await this.validatePendingPath('chat', key, pending.path)
      target = pending.path
    }
    if (!await canonicalize(target))
      createdDirectory = true
    await ensureDirectory(target)
    const path = (await canonicalize(target)) ?? target
    if (pending.path !== path) {
      pending = { ...pending, path }
      await savePendingCreation(key, pending)
    }
    let core: WorkspaceView
    const recordedCore = pending.workspaceId ? this.workspaces.get(pending.workspaceId) : undefined
    if (recordedCore && !await this.samePath(recordedCore.path, pending.path))
      throw new Error(`创建凭据指向的核心工作区路径已变化：${recordedCore.workspaceId}`)
    const existingCore = recordedCore ?? await this.coreByPath(path)
    try {
      core = existingCore ?? await this.workspaces.create(path, chatTitle(path))
    }
    catch (error) {
      if (createdDirectory && await removeEmptyDirectory(path))
        await finishPendingCreation(key)
      throw error
    }
    pending = { ...pending, path: core.path, workspaceId: core.workspaceId }
    await savePendingCreation(key, pending)
    if (current.chats.some(chat => chat.workspaceId === core.workspaceId)) {
      await finishPendingCreation(key)
      throw new Error(`对话工作区「${core.title}」已经登记`)
    }
    const chat: ChatData = { workspaceId: core.workspaceId }
    try {
      await this.save({ ...clone(current), chats: [...current.chats, chat] })
      await finishPendingCreation(key).catch(error => this.log(`[dsh-space] 清理已完成创建凭据失败：${(error as Error).message}`))
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function removeEmptyDirectory(path: string): Promise<boolean> {
  try {
    if ((await readdir(path)).length !== 0)
      return false
    await rmdir(path)
    return true
  }
  catch {
    // 目录可能在失败处理期间被其他进程移除
    return false
  }
}

export function createSpaceOperations(store: SpaceStore, workspaces: WorkspaceService, log?: Logger): SpaceOperations {
  return new SpaceOperationsImpl(store, workspaces, log)
}
