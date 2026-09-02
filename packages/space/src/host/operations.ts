import type { ChatEntity, SpaceEntity, SpaceRegistry } from '../domain/types.ts'
import type { Logger } from '../shared/log.ts'
import type { SpacesStore, StoredRegistry } from '../store/spaces.ts'
import type { CoreWorkspaceAdapter, CoreWorkspaceView } from './core-workspace.ts'
import { rm } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { createChatDirectory, createChatEntity, dropChat, findChat, replaceChatWorkspaceId } from '../domain/chats.ts'
import { attachFolder, canonicalFolderPath, createSpaceEntity, detachFolder, dropSpace, findSpace, replaceWorkspaceId, setFolderDesc, setFolderTitle, setPrimary } from '../domain/space.ts'
import { SHELL_PROJECTS_DIR } from '../shared/constants.ts'
import { canonicalize, isUnder } from '../shared/fs-path.ts'
import { assertFsSafeName, assertSafePathSegment, ensureDir, spacesDir } from '../shared/paths.ts'

export type SpaceOperation
  = | { op: 'create-space', name: string, folder?: string, mode?: 'link' | 'reference', linkName?: string, title?: string, desc?: string }
    | { op: 'attach', space: string, target: string, mode?: 'link' | 'reference', name?: string, title?: string, desc?: string }
    | { op: 'detach', space: string, target: string }
    | { op: 'primary', space: string, target: string }
    | { op: 'title', space: string, target: string, value: string }
    | { op: 'desc', space: string, target: string, value: string }
    | { op: 'create-chat', name?: string }
    | { op: 'drop-chat', ref: string }
    | { op: 'rebind-space', space: string }
    | { op: 'rebind-chat', chat: string }
    | { op: 'reorder-spaces', ids: string[] }
    | { op: 'drop-space', space: string }

export interface RegistrySnapshot extends SpaceRegistry {
  root: string
}

/**
 * 工作区操作模块
 *
 * @description 所有写入口共享同一个串行队列；模块内部负责文件系统、核心工作区与
 * 附加注册表的顺序约束，调用方不再持有可过期的全量快照
 */
export interface SpaceOperations {
  initialize: () => Promise<void>
  snapshot: () => RegistrySnapshot
  coreRows: () => CoreWorkspaceView[]
  execute: (operation: SpaceOperation) => Promise<Record<string, unknown>>
  dispose: () => void
}

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

async function normalizeStoredPath(rawPath: string, label: string): Promise<{ exists: boolean, path: string }> {
  const trimmed = rawPath.trim()
  if (!trimmed || !isAbsolute(trimmed))
    throw new Error(`${label}必须是绝对路径：${rawPath}`)
  const canonical = await canonicalize(trimmed)
  return { exists: canonical !== undefined, path: canonical ?? resolve(trimmed) }
}

class SpaceOperationsImpl implements SpaceOperations {
  private tail: Promise<void> = Promise.resolve()
  private state?: SpaceRegistry
  private stopWatching?: () => void

  constructor(
    private readonly store: SpacesStore,
    private readonly core: CoreWorkspaceAdapter,
    private readonly log: Logger,
  ) {}

  async initialize(): Promise<void> {
    await this.enqueue(async () => {
      await this.load(this.store.read())
    })
    this.stopWatching = this.store.watch((registry) => {
      void this.enqueue(async () => {
        await this.load(registry)
      }).catch(error => this.log(`[dsh-space] 重载注册表失败：${(error as Error).message}`))
    })
  }

  snapshot(): RegistrySnapshot {
    const state = this.requireState()
    return { root: this.store.root(), spaces: state.spaces, chats: state.chats }
  }

  coreRows(): CoreWorkspaceView[] {
    return this.core.list()
  }

  execute(operation: SpaceOperation): Promise<Record<string, unknown>> {
    return this.enqueue(() => this.run(operation))
  }

  dispose(): void {
    this.stopWatching?.()
    this.stopWatching = undefined
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.then(() => {}, () => {})
    return result
  }

  private requireState(): SpaceRegistry {
    if (!this.state)
      throw new Error('dsh-space 操作模块尚未初始化')
    return this.state
  }

  private async load(stored: StoredRegistry): Promise<void> {
    if (this.state && stored.version === 2 && sameJson(stored.spaces, this.state.spaces) && sameJson(stored.chats, this.state.chats))
      return
    const migrated = await this.migrate(stored)
    if (stored.version !== 2 || !sameJson(stored.spaces, migrated.spaces) || !sameJson(stored.chats, migrated.chats)) {
      await this.store.save(migrated)
      this.log('[dsh-space] 已把旧注册表迁移为固定壳 + 必选核心绑定')
    }
    this.state = migrated
  }

  /** 把旧无壳/未绑定记录一次性提升为当前不变量 */
  private async migrate(stored: StoredRegistry): Promise<SpaceRegistry> {
    if (stored.version !== 1 && stored.version !== 2)
      throw new Error(`不支持 dsh-space 注册表版本 ${stored.version}`)

    if (stored.version === 2) {
      const incompleteSpace = stored.spaces.find(item => !item.shell?.trim() || !item.workspaceId?.trim())
      if (incompleteSpace)
        throw new Error(`v2 工作区「${incompleteSpace.name}」缺少 shell 或 workspaceId，拒绝自动兼容`)
      const incompleteChat = stored.chats.find(item => !item.workspaceId?.trim())
      if (incompleteChat)
        throw new Error(`v2 对话「${incompleteChat.path}」缺少 workspaceId，拒绝自动兼容`)
    }

    const normalizedNames = stored.spaces.map(item => assertFsSafeName(item.name))
    if (new Set(normalizedNames).size !== normalizedNames.length)
      throw new Error('旧注册表含重名工作区，无法自动迁移')
    const ids = stored.spaces.map(item => item.id)
    if (new Set(ids).size !== ids.length)
      throw new Error('旧注册表含重复工作区 id，无法自动迁移')

    const spaces: SpaceEntity[] = []
    for (const item of stored.spaces) {
      const name = assertFsSafeName(item.name)
      const storedShell = item.shell?.trim()
      let shell: string
      let shellExists: boolean
      let createdShell = false
      if (storedShell) {
        const normalized = await normalizeStoredPath(storedShell, `工作区「${name}」的壳目录`)
        shell = normalized.path
        shellExists = normalized.exists
      }
      else {
        const target = join(spacesDir(this.store.root()), name)
        const existing = await canonicalize(target)
        if (existing) {
          shell = existing
          shellExists = true
        }
        else {
          await ensureDir(join(target, SHELL_PROJECTS_DIR))
          shell = (await canonicalize(target))!
          shellExists = true
          createdShell = true
        }
      }

      let workspaceId = item.workspaceId?.trim()
      const needsRegistration = !storedShell || !workspaceId
      if (needsRegistration && !shellExists) {
        await ensureDir(join(shell, SHELL_PROJECTS_DIR))
        shell = (await canonicalize(shell))!
        shellExists = true
        createdShell = true
      }
      else if (shellExists) {
        await ensureDir(join(shell, SHELL_PROJECTS_DIR))
      }

      if (needsRegistration) {
        try {
          const row = await this.core.ensure(shell, name)
          shell = row.path
          workspaceId = row.id
        }
        catch (error) {
          if (createdShell)
            await rm(shell, { recursive: true, force: true })
          throw error
        }
      }

      const space: SpaceEntity = { ...item, name, shell, workspaceId: workspaceId! }
      for (const folder of space.folders) {
        if (folder.mode === 'link' && folder.linkPath && !isUnder(folder.linkPath, join(space.shell, SHELL_PROJECTS_DIR)))
          throw new Error(`工作区「${space.name}」含壳外 link 记录：${folder.linkPath}`)
      }
      if (space.primary && !space.folders.some(folder => folder.path === space.primary))
        space.primary = space.folders[0]?.path
      spaces.push(space)
    }

    const chats: ChatEntity[] = []
    for (const item of stored.chats) {
      const normalized = await normalizeStoredPath(item.path, '对话目录')
      let path = normalized.path
      let workspaceId = item.workspaceId?.trim()
      if (!workspaceId) {
        if (!normalized.exists)
          throw new Error(`对话目录不存在且没有核心绑定，无法迁移：${item.path}`)
        const row = await this.core.ensure(path, basename(path))
        path = row.path
        workspaceId = row.id
      }
      chats.push({ path, workspaceId })
    }

    return { spaces, chats }
  }

  private async commit(next: SpaceRegistry): Promise<void> {
    await this.store.save(next)
    this.state = next
  }

  private async run(operation: SpaceOperation): Promise<Record<string, unknown>> {
    const current = this.requireState()
    switch (operation.op) {
      case 'create-space': {
        const name = assertFsSafeName(operation.name)
        if (current.spaces.some(space => space.name === name))
          throw new Error(`工作区「${name}」已存在`)
        const firstFolder = operation.folder ? await canonicalFolderPath(operation.folder) : undefined
        if (!firstFolder && (operation.mode !== undefined || operation.linkName !== undefined || operation.title !== undefined || operation.desc !== undefined))
          throw new Error('mode/linkName/title/desc 只能与 folder 一起提交')
        if (operation.mode !== 'link' && operation.linkName !== undefined)
          throw new Error('linkName 只用于 link 模式')
        if (operation.mode === 'link' && firstFolder)
          assertSafePathSegment(operation.linkName || basename(firstFolder))

        const target = join(spacesDir(this.store.root()), name)
        let shell = await canonicalize(target)
        let createdShell = false
        if (!shell) {
          await ensureDir(join(target, SHELL_PROJECTS_DIR))
          shell = (await canonicalize(target))!
          createdShell = true
        }
        else {
          await ensureDir(join(shell, SHELL_PROJECTS_DIR))
        }

        let row: CoreWorkspaceView
        try {
          row = await this.core.ensure(shell, name)
        }
        catch (error) {
          if (createdShell)
            await rm(shell, { recursive: true, force: true })
          throw error
        }

        let created = createSpaceEntity(current.spaces, name, row.path, row.id)
        if (firstFolder) {
          const attached = await attachFolder(created.data, created.space.id, firstFolder, {
            mode: operation.mode,
            name: operation.linkName,
            title: operation.title,
            desc: operation.desc,
          })
          created = { data: attached.data, space: attached.space }
        }
        await this.commit({ spaces: created.data, chats: current.chats })
        return { space: created.space }
      }
      case 'attach': {
        const result = await attachFolder(current.spaces, operation.space, operation.target, {
          mode: operation.mode,
          name: operation.name,
          title: operation.title,
          desc: operation.desc,
        })
        await this.commit({ spaces: result.data, chats: current.chats })
        return { folder: result.folder, primary: result.space.primary }
      }
      case 'detach': {
        const result = await detachFolder(current.spaces, operation.space, operation.target)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { detached: result.folder }
      }
      case 'primary': {
        const result = await setPrimary(current.spaces, operation.space, operation.target)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { primary: result.space.primary }
      }
      case 'title': {
        const result = await setFolderTitle(current.spaces, operation.space, operation.target, operation.value)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { folder: result.folder }
      }
      case 'desc': {
        const result = await setFolderDesc(current.spaces, operation.space, operation.target, operation.value)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { folder: result.folder }
      }
      case 'create-chat': {
        const path = await createChatDirectory(this.store.root(), operation.name)
        let row: CoreWorkspaceView
        try {
          row = await this.core.ensure(path, basename(path))
        }
        catch (error) {
          await rm(path, { recursive: true, force: true })
          throw error
        }
        const result = createChatEntity(current.chats, row.path, row.id)
        try {
          await this.commit({ spaces: current.spaces, chats: result.data })
        }
        catch (error) {
          await rm(path, { recursive: true, force: true }).catch((cleanupError) => {
            this.log(`[dsh-space] 回滚对话目录失败（${path}）：${(cleanupError as Error).message}`)
          })
          throw error
        }
        return { chat: result.chat }
      }
      case 'drop-chat': {
        const result = await dropChat(current.chats, operation.ref)
        await this.commit({ spaces: current.spaces, chats: result.data })
        return { dropped: result.chat.path }
      }
      case 'rebind-space': {
        const space = findSpace(current.spaces, operation.space)
        const existing = this.core.get(space.workspaceId)
        if (existing?.path === space.shell)
          return { workspaceId: existing.id, healed: false }
        const row = await this.core.ensure(space.shell, space.name)
        const result = replaceWorkspaceId(current.spaces, space.id, row.id)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { workspaceId: row.id, healed: true }
      }
      case 'rebind-chat': {
        const chat = await findChat(current.chats, operation.chat)
        const existing = this.core.get(chat.workspaceId)
        if (existing?.path === chat.path)
          return { workspaceId: existing.id, healed: false }
        const row = await this.core.ensure(chat.path, basename(chat.path))
        const result = replaceChatWorkspaceId(current.chats, chat.path, row.id)
        await this.commit({ spaces: current.spaces, chats: result.data })
        return { workspaceId: row.id, healed: true }
      }
      case 'reorder-spaces': {
        const ids = operation.ids
        const byId = new Map(current.spaces.map(space => [space.id, space]))
        if (ids.length !== current.spaces.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id)))
          throw new Error(`ids 与现有工作区集合不一致（现有 ${current.spaces.length} 个）`)
        await this.commit({ spaces: ids.map(id => byId.get(id)!), chats: current.chats })
        return { reordered: ids.length }
      }
      case 'drop-space': {
        const result = dropSpace(current.spaces, operation.space)
        await this.commit({ spaces: result.data, chats: current.chats })
        return { dropped: result.space.name }
      }
    }
  }
}

export function createSpaceOperations(store: SpacesStore, core: CoreWorkspaceAdapter, log: Logger = message => console.warn(message)): SpaceOperations {
  return new SpaceOperationsImpl(store, core, log)
}
