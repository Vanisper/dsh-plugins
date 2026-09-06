import type { SpaceStore } from '../store/settings.ts'
import type { WorkspaceService } from '../workspace/core.ts'
import type { SpaceSettings, WorkspaceView } from './types.ts'
import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { chatsDir, localDateName, spacesDir } from '../shared/paths.ts'
import { savePendingCreation, startPendingCreation } from '../store/pending.ts'
import { spaceRevision } from './member-draft.ts'
import { createSpaceOperations } from './operations.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-space-'))
  roots.push(path)
  return path
}

function settings(): SpaceSettings {
  return { root: '', spaces: [], chats: [] }
}

function fakeStore(root: string, initial = settings()): SpaceStore & {
  failNextReplace: boolean
  value: SpaceSettings
  beforeReplace?: () => Promise<void>
  afterReplace?: () => Promise<void>
} {
  return {
    value: structuredClone(initial),
    failNextReplace: false,
    read() {
      return structuredClone(this.value)
    },
    async replace(next) {
      await this.beforeReplace?.()
      if (this.failNextReplace) {
        this.failNextReplace = false
        throw new Error('settings write failed')
      }
      this.value = structuredClone(next)
      await this.afterReplace?.()
    },
    root: () => root,
  }
}

function fakeWorkspaces(initial: WorkspaceView[] = []): WorkspaceService & {
  createError?: Error
  rows: WorkspaceView[]
} {
  return {
    rows: structuredClone(initial),
    createError: undefined,
    async create(path, title = '') {
      if (this.createError)
        throw this.createError
      const row = { workspaceId: `workspace-${this.rows.length + 1}`, path, title, sessionIds: [] }
      this.rows.push(row)
      return structuredClone(row)
    },
    get(id) {
      const row = this.rows.find(item => item.workspaceId === id)
      return row ? structuredClone(row) : undefined
    },
    list() {
      return structuredClone(this.rows)
    },
    async resolveByPath(path) {
      const row = this.rows.find(item => item.path === path)
      return row ? structuredClone(row) : undefined
    },
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false)
}

describe('create space', () => {
  it.each(['create-space', 'create-chat'] as const)('通过官方路径查询契约执行 %s', async (op) => {
    const root = await temporaryRoot()
    const workspaces = fakeWorkspaces()
    workspaces.resolveByPath = path => WorkspaceRegistry.prototype.resolveByPath.call({ entities: new Map() } as unknown as WorkspaceRegistry, path)
      .then(() => undefined)

    await expect(createSpaceOperations(fakeStore(root), workspaces).execute({ op, name: 'demo' })).resolves.toHaveProperty(op === 'create-space' ? 'space' : 'chat')
    expect(workspaces.rows).toHaveLength(1)
  })

  it('保留路径查询的非缺失错误', async () => {
    const workspaces = fakeWorkspaces()
    workspaces.resolveByPath = async () => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    }
    await expect(createSpaceOperations(fakeStore(await temporaryRoot()), workspaces).execute({ op: 'create-space', name: 'demo' })).rejects.toThrow('permission denied')
    expect(workspaces.rows).toEqual([])
  })

  it('validates all input before creating the managed directory', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)

    await expect(operations.execute({ op: 'create-space', name: '../invalid' })).rejects.toThrow('非法字符')

    expect(await exists(spacesDir(root))).toBe(false)
    expect(workspaces.rows).toEqual([])
  })

  it('removes only its empty directory when core creation fails', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    workspaces.createError = new Error('core create failed')
    const operations = createSpaceOperations(store, workspaces)

    await expect(operations.execute({ op: 'create-space', name: 'demo' })).rejects.toThrow('core create failed')

    expect(await exists(join(spacesDir(root), 'demo'))).toBe(false)
  })

  it('reuses the same core workspace after the settings write fails', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)
    store.failNextReplace = true

    await expect(operations.execute({ op: 'create-space', name: 'demo' })).rejects.toThrow('settings write failed')
    expect(await exists(join(spacesDir(root), 'demo'))).toBe(true)
    expect(workspaces.rows).toHaveLength(1)

    const result = await operations.execute({ op: 'create-space', name: 'demo' })

    expect(workspaces.rows).toHaveLength(1)
    expect(store.value.spaces).toEqual([{ workspaceId: 'workspace-1', members: [] }])
    expect(result.space).toMatchObject({ workspaceId: 'workspace-1', path: await canonicalize(join(spacesDir(root), 'demo')) })
  })

  it('does not treat an arbitrary core workspace as a failed creation', async () => {
    const root = await temporaryRoot()
    const path = join(spacesDir(root), 'demo')
    await mkdir(path, { recursive: true })
    const workspaces = fakeWorkspaces([{ workspaceId: 'plain', path: (await canonicalize(path))!, title: 'Plain', sessionIds: [] }])
    const operations = createSpaceOperations(fakeStore(root), workspaces)

    await expect(operations.execute({ op: 'create-space', name: 'demo' })).rejects.toThrow('显式增强')
  })

  it('rejects a pending marker that points outside the managed directory', async () => {
    const root = await temporaryRoot()
    const target = join(spacesDir(root), 'demo')
    const pending = await startPendingCreation(target, 'space')
    await savePendingCreation(target, { ...pending, path: join(root, 'outside') })
    const operations = createSpaceOperations(fakeStore(root), fakeWorkspaces())

    await expect(operations.execute({ op: 'create-space', name: 'demo' })).rejects.toThrow('超出托管目录')
  })
})

describe('create chat', () => {
  it.each([10, 19, 100])('设置写入失败后可恢复编号为 %i 的同名对话', async (suffix) => {
    const root = await temporaryRoot()
    const path = join(chatsDir(root), localDateName(), 'topic')
    for (let index = 1; index < suffix; index++)
      await mkdir(index === 1 ? path : `${path}-${index}`, { recursive: true })
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)
    store.failNextReplace = true
    await expect(operations.execute({ op: 'create-chat', name: 'topic' })).rejects.toThrow('settings write failed')
    await expect(operations.execute({ op: 'create-chat', name: 'topic' })).resolves.toHaveProperty('chat.workspaceId', 'workspace-1')
    expect(workspaces.rows).toHaveLength(1)
  })

  it('keeps the core row, removes an empty directory, and reuses both identity and path on retry', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)
    const path = join(chatsDir(root), localDateName(), 'topic')
    store.failNextReplace = true

    await expect(operations.execute({ op: 'create-chat', name: 'Topic' })).rejects.toThrow('settings write failed')
    expect(await exists(path)).toBe(false)
    expect(workspaces.rows).toHaveLength(1)

    const result = await operations.execute({ op: 'create-chat', name: 'Topic' })

    expect(workspaces.rows).toHaveLength(1)
    expect(store.value.chats).toEqual([{ workspaceId: 'workspace-1' }])
    expect(result.chat).toMatchObject({ workspaceId: 'workspace-1', path: await canonicalize(path) })
  })

  it('does not adopt an unrelated core row whose directory is missing', async () => {
    const root = await temporaryRoot()
    const basePath = join(chatsDir(root), localDateName(), 'topic')
    const workspaces = fakeWorkspaces([{ workspaceId: 'plain', path: basePath, title: 'Plain', sessionIds: [] }])
    const store = fakeStore(root)
    const operations = createSpaceOperations(store, workspaces)

    const result = await operations.execute({ op: 'create-chat', name: 'Topic' })

    expect(workspaces.rows).toHaveLength(2)
    expect(result.chat).toMatchObject({ workspaceId: 'workspace-2', path: await canonicalize(`${basePath}-2`) })
    expect(store.value.chats).toEqual([{ workspaceId: 'workspace-2' }])
  })

  it('does not remove a directory that became non-empty before a failed settings write', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)
    const path = join(chatsDir(root), localDateName(), 'topic')
    store.failNextReplace = true
    store.beforeReplace = async () => writeFile(join(path, 'keep.txt'), 'keep')

    await expect(operations.execute({ op: 'create-chat', name: 'Topic' })).rejects.toThrow('settings write failed')

    expect(await readdir(path)).toContain('keep.txt')
  })
})

describe('operation queue', () => {
  it('reads settings again when a queued operation starts', async () => {
    const root = await temporaryRoot()
    const initial = settings()
    initial.spaces.push({ workspaceId: 'space', members: [] })
    const store = fakeStore(root, initial)
    const workspaces = fakeWorkspaces([{ workspaceId: 'space', path: join(root, 'space'), title: 'Space', sessionIds: [] }])
    const operations = createSpaceOperations(store, workspaces)
    let injected = false
    store.afterReplace = async () => {
      if (injected)
        return
      injected = true
      store.value.chats.push({ workspaceId: 'external-chat' })
    }

    const first = operations.execute({ op: 'drop-space', workspace: 'space' })
    const second = operations.execute({ op: 'enhance-space', workspace: 'external' })
    workspaces.rows.push({ workspaceId: 'external', path: join(root, 'external'), title: 'External', sessionIds: [] })
    await first
    await second

    expect(store.value).toEqual({
      root: '',
      spaces: [{ workspaceId: 'external', members: [] }],
      chats: [{ workspaceId: 'external-chat' }],
    })
  })
})

describe('update member', () => {
  it('多成员创建只写入一次，并以选定成员为主成员', async () => {
    const root = await temporaryRoot()
    const paths = [join(root, 'a'), join(root, 'b')]
    for (const path of paths)
      await mkdir(path)
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    await createSpaceOperations(store, workspaces).execute({ op: 'create-space', name: 'demo', members: paths.map(path => ({ path })), primary: paths[1] })
    expect(store.value.spaces[0]?.members).toHaveLength(2)
    expect(store.value.spaces[0]?.primary).toBe(await canonicalize(paths[1]!))
    expect(workspaces.rows).toHaveLength(1)
  })

  it('真实路径重复时在创建目录前拒绝整个草稿', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'source')
    const alias = join(root, 'alias')
    await mkdir(path)
    await symlink(path, alias)
    const workspaces = fakeWorkspaces()
    await expect(createSpaceOperations(fakeStore(root), workspaces).execute({ op: 'create-space', name: 'demo', members: [{ path }, { path: alias }] })).rejects.toThrow('重复成员路径')
    expect(workspaces.rows).toHaveLength(0)
    expect(await exists(spacesDir(root))).toBe(false)
  })

  it('拒绝过期草稿，不覆盖外部成员更改', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const operations = createSpaceOperations(store, fakeWorkspaces())
    await operations.execute({ op: 'create-space', name: 'demo' })
    const space = store.value.spaces[0]!
    const revision = spaceRevision(space)
    const path = await canonicalize(root) as string
    await operations.execute({ op: 'attach', workspace: space.workspaceId, target: path })
    await expect(operations.execute({ op: 'save-members', workspace: space.workspaceId, members: [], expectedRevision: revision })).rejects.toThrow('其他位置修改')
    expect(store.value.spaces[0]?.members).toHaveLength(1)
  })

  it('批量保存失败时保留原描述和原链接，清理本次新增链接', async () => {
    const root = await temporaryRoot()
    const store = fakeStore(root)
    const workspaces = fakeWorkspaces()
    const operations = createSpaceOperations(store, workspaces)
    await mkdir(join(root, 'a'))
    await mkdir(join(root, 'b'))
    await operations.execute({ op: 'create-space', name: 'demo', members: [{ path: join(root, 'a'), mode: 'link' }] })
    const old = structuredClone(store.value.spaces[0]!)
    store.failNextReplace = true
    const operation = { op: 'save-members' as const, workspace: old.workspaceId, members: [{ path: join(root, 'b'), mode: 'link' as const }], expectedRevision: spaceRevision(old) }
    await expect(operations.execute(operation)).rejects.toThrow('settings write failed')
    expect(store.value.spaces[0]).toEqual(old)
    expect(await exists(join(workspaces.rows[0]!.path, 'projects/a'))).toBe(true)
    expect(await exists(join(workspaces.rows[0]!.path, 'projects/b'))).toBe(false)
    await operations.execute(operation)
    expect(await exists(join(workspaces.rows[0]!.path, 'projects/a'))).toBe(false)
    expect(await exists(join(workspaces.rows[0]!.path, 'projects/b'))).toBe(true)
  })

  it('updates title and description with one settings write', async () => {
    const root = await temporaryRoot()
    const memberPath = join(root, 'member')
    await mkdir(memberPath)
    const initial: SpaceSettings = {
      root: '',
      spaces: [{ workspaceId: 'space', primary: memberPath, members: [{ path: memberPath, mode: 'reference', title: 'Old' }] }],
      chats: [],
    }
    const store = fakeStore(root, initial)
    const workspaces = fakeWorkspaces([{ workspaceId: 'space', path: join(root, 'space'), title: 'Space', sessionIds: [] }])
    let writes = 0
    store.afterReplace = async () => {
      writes += 1
    }

    await createSpaceOperations(store, workspaces).execute({ op: 'update-member', workspace: 'space', target: memberPath, title: 'New', description: 'Details' })

    expect(writes).toBe(1)
    expect(store.value.spaces[0]?.members[0]).toMatchObject({ title: 'New', description: 'Details' })
  })
})
