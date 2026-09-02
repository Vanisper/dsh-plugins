import type { SpaceRegistry } from '../domain/types.ts'
import type { SpacesStore, StoredRegistry } from '../store/spaces.ts'
import type { CoreWorkspaceAdapter, CoreWorkspaceView } from './core-workspace.ts'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { todayDirName } from '../shared/paths.ts'
import { createSpaceOperations } from './operations.ts'

let root: string
let dirA: string
let dirB: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-operations-'))))!
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-operations-a-'))))!
  dirB = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-operations-b-'))))!
})

afterEach(async () => {
  for (const dir of [root, dirA, dirB])
    await rm(dir, { recursive: true, force: true })
})

interface Harness {
  operations: ReturnType<typeof createSpaceOperations>
  registry: () => StoredRegistry
  rows: CoreWorkspaceView[]
  saves: () => number
  failCoreOnce: () => void
  failSaveOnce: () => void
  removeCore: (id: string) => void
}

async function createHarness(initial: StoredRegistry = { version: 2, spaces: [], chats: [] }, initialRows: CoreWorkspaceView[] = []): Promise<Harness> {
  let stored = structuredClone(initial)
  let watcher: ((registry: StoredRegistry) => void) | undefined
  let saveCount = 0
  let failCore = false
  let failSave = false
  let nextWorkspace = initialRows.length + 1
  const rows = structuredClone(initialRows)

  const store: SpacesStore = {
    read: () => structuredClone(stored),
    save: async (registry: SpaceRegistry) => {
      saveCount++
      if (failSave) {
        failSave = false
        throw new Error('settings write failed')
      }
      stored = { version: 2, ...structuredClone(registry) }
      watcher?.(structuredClone(stored))
    },
    root: () => root,
    watch: (callback) => {
      watcher = callback
      return () => {
        if (watcher === callback)
          watcher = undefined
      }
    },
  }

  const core: CoreWorkspaceAdapter = {
    ensure: async (path, title) => {
      if (failCore) {
        failCore = false
        throw new Error('core create failed')
      }
      const canonical = (await canonicalize(path))!
      const existing = rows.find(row => row.path === canonical)
      if (existing)
        return structuredClone(existing)
      const row: CoreWorkspaceView = { id: `ws-${nextWorkspace++}`, path: canonical, title, sessionIds: [] }
      rows.push(row)
      return structuredClone(row)
    },
    get: (id) => {
      const row = rows.find(item => item.id === id)
      return row ? structuredClone(row) : undefined
    },
    list: () => structuredClone(rows),
  }

  const operations = createSpaceOperations(store, core, () => {})
  await operations.initialize()
  return {
    operations,
    registry: () => structuredClone(stored),
    rows,
    saves: () => saveCount,
    failCoreOnce: () => {
      failCore = true
    },
    failSaveOnce: () => {
      failSave = true
    },
    removeCore: (id) => {
      const index = rows.findIndex(row => row.id === id)
      if (index >= 0)
        rows.splice(index, 1)
    },
  }
}

describe('initialize', () => {
  it('把旧无壳工作区与未绑定对话迁移为固定壳和核心绑定', async () => {
    const chatPath = join(root, 'chats', '2026-09-02', 'legacy-chat')
    await mkdir(chatPath, { recursive: true })
    const oldCore: CoreWorkspaceView = { id: 'ws-old', path: dirA, title: 'legacy', sessionIds: ['historical-session'] }
    const harness = await createHarness({
      version: 1,
      spaces: [{ id: 'sp-old', name: 'legacy', primary: dirA, workspaceId: oldCore.id, folders: [{ path: dirA, mode: 'reference' }] }],
      chats: [{ path: chatPath }],
    }, [oldCore])

    const migrated = harness.registry()
    const space = migrated.spaces[0]!
    expect(migrated.version).toBe(2)
    expect(space.shell).toBe(join(root, 'spaces', 'legacy'))
    expect(space.workspaceId).not.toBe(oldCore.id)
    expect(await canonicalize(join(space.shell!, 'projects'))).toBeTruthy()
    expect(migrated.chats[0]?.workspaceId).toBeTruthy()
    expect(harness.rows.find(row => row.id === oldCore.id)?.sessionIds).toEqual(['historical-session'])
    expect(harness.rows.find(row => row.id === space.workspaceId)?.sessionIds).toEqual([])
    harness.operations.dispose()
  })

  it('拒绝重名工作区，避免迁移时共享同一壳目录', async () => {
    await expect(createHarness({
      version: 1,
      spaces: [
        { id: 'a', name: 'same', folders: [] },
        { id: 'b', name: 'same', folders: [] },
      ],
      chats: [],
    })).rejects.toThrow('重名工作区')
  })

  it('保留 v2 的悬空与错位绑定，等待显式 rebind', async () => {
    const missingShell = join(root, 'spaces', 'missing')
    const missingChat = join(root, 'chats', '2026-09-02', 'missing')
    const mismatchedRow: CoreWorkspaceView = { id: 'ws-mismatch', path: dirB, title: 'mismatch', sessionIds: ['historical-session'] }
    const harness = await createHarness({
      version: 2,
      spaces: [
        { id: 'sp-dangling', name: 'dangling', shell: missingShell, workspaceId: 'ws-deleted', folders: [] },
        { id: 'sp-mismatch', name: 'mismatch', shell: dirA, workspaceId: mismatchedRow.id, folders: [] },
      ],
      chats: [{ path: missingChat, workspaceId: 'ws-chat-deleted' }],
    }, [mismatchedRow])

    expect(harness.registry().spaces[0]).toMatchObject({ shell: missingShell, workspaceId: 'ws-deleted' })
    expect(harness.registry().spaces[1]).toMatchObject({ shell: dirA, workspaceId: mismatchedRow.id })
    expect(harness.registry().chats[0]).toEqual({ path: missingChat, workspaceId: 'ws-chat-deleted' })
    expect(await canonicalize(missingShell)).toBeUndefined()
    expect(harness.rows).toEqual([mismatchedRow])
    expect(harness.saves()).toBe(0)
    harness.operations.dispose()
  })

  it('拒绝自动补齐结构不完整的 v2 记录', async () => {
    await expect(createHarness({
      version: 2,
      spaces: [{ id: 'sp-broken', name: 'broken', folders: [] }],
      chats: [],
    })).rejects.toThrow('v2 工作区')

    await expect(createHarness({
      version: 2,
      spaces: [],
      chats: [{ path: join(root, 'chats', '2026-09-02', 'broken') }],
    })).rejects.toThrow('v2 对话')
  })

  it('拒绝未知的未来注册表版本，避免静默降级覆盖', async () => {
    await expect(createHarness({ version: 3, spaces: [], chats: [] })).rejects.toThrow('不支持 dsh-space 注册表版本 3')
  })
})

describe('create-space', () => {
  it('建壳、核心登记、首成员挂入和附加注册一次完成', async () => {
    const harness = await createHarness()
    const result = await harness.operations.execute({ op: 'create-space', name: 'workspace', folder: dirA, mode: 'link', linkName: 'repo' })
    const space = result.space as SpaceRegistry['spaces'][number]
    expect(space.shell).toBe(join(root, 'spaces', 'workspace'))
    expect(space.workspaceId).toBe(harness.rows[0]?.id)
    expect(space.folders[0]).toMatchObject({ path: dirA, mode: 'link', linkPath: join(space.shell, 'projects', 'repo') })
    expect(harness.registry().spaces).toEqual([space])
    expect(harness.saves()).toBe(1)
    harness.operations.dispose()
  })

  it('无 folder 时拒绝成员选项，且不产生壳或核心行', async () => {
    const harness = await createHarness()
    await expect(harness.operations.execute({ op: 'create-space', name: 'invalid', mode: 'link' })).rejects.toThrow('只能与 folder')
    expect(await canonicalize(join(root, 'spaces', 'invalid'))).toBeUndefined()
    expect(harness.rows).toEqual([])
    harness.operations.dispose()
  })

  it('核心登记失败时清理本次新建壳目录', async () => {
    const harness = await createHarness()
    harness.failCoreOnce()
    await expect(harness.operations.execute({ op: 'create-space', name: 'failed' })).rejects.toThrow('core create failed')
    expect(await canonicalize(join(root, 'spaces', 'failed'))).toBeUndefined()
    expect(harness.registry().spaces).toEqual([])
    harness.operations.dispose()
  })

  it('settings 写失败后保留可恢复壳与核心行，重试不会重复登记', async () => {
    const harness = await createHarness()
    harness.failSaveOnce()
    await expect(harness.operations.execute({ op: 'create-space', name: 'recoverable' })).rejects.toThrow('settings write failed')
    expect(await canonicalize(join(root, 'spaces', 'recoverable'))).toBeTruthy()
    expect(harness.rows).toHaveLength(1)
    expect(harness.registry().spaces).toEqual([])

    const result = await harness.operations.execute({ op: 'create-space', name: 'recoverable' })
    expect((result.space as SpaceRegistry['spaces'][number]).workspaceId).toBe(harness.rows[0]?.id)
    expect(harness.rows).toHaveLength(1)
    expect(harness.registry().spaces).toHaveLength(1)
    harness.operations.dispose()
  })
})

describe('串行写入与成员语义', () => {
  it('并发 attach 不会用旧快照互相覆盖', async () => {
    const harness = await createHarness()
    await harness.operations.execute({ op: 'create-space', name: 'workspace' })
    await Promise.all([
      harness.operations.execute({ op: 'attach', space: 'workspace', target: dirA }),
      harness.operations.execute({ op: 'attach', space: 'workspace', target: dirB }),
    ])
    expect(harness.registry().spaces[0]?.folders.map(folder => folder.path)).toEqual([dirA, dirB])
    harness.operations.dispose()
  })

  it('切换 primary 不改变壳目录或核心绑定', async () => {
    const harness = await createHarness()
    await harness.operations.execute({ op: 'create-space', name: 'workspace', folder: dirA })
    await harness.operations.execute({ op: 'attach', space: 'workspace', target: dirB })
    const before = harness.registry().spaces[0]!
    await harness.operations.execute({ op: 'primary', space: 'workspace', target: dirB })
    const after = harness.registry().spaces[0]!
    expect(after.primary).toBe(dirB)
    expect(after.shell).toBe(before.shell)
    expect(after.workspaceId).toBe(before.workspaceId)
    harness.operations.dispose()
  })

  it('reorder-spaces 要求无重复的完整 id 集合', async () => {
    const harness = await createHarness()
    await harness.operations.execute({ op: 'create-space', name: 'a' })
    await harness.operations.execute({ op: 'create-space', name: 'b' })
    const ids = harness.registry().spaces.map(space => space.id)
    await expect(harness.operations.execute({ op: 'reorder-spaces', ids: [ids[0]!, ids[0]!] })).rejects.toThrow('不一致')
    await harness.operations.execute({ op: 'reorder-spaces', ids: [...ids].reverse() })
    expect(harness.registry().spaces.map(space => space.name)).toEqual(['b', 'a'])
    harness.operations.dispose()
  })
})

describe('对话与绑定修复', () => {
  it('创建对话时建目录、登记核心行并写附加注册表', async () => {
    const harness = await createHarness()
    const result = await harness.operations.execute({ op: 'create-chat', name: 'topic' })
    const chat = result.chat as SpaceRegistry['chats'][number]
    expect(chat.path).toBe(join(root, 'chats', todayDirName(), 'topic'))
    expect(await canonicalize(chat.path)).toBe(chat.path)
    expect(harness.registry().chats).toEqual([chat])
    expect(harness.rows[0]?.id).toBe(chat.workspaceId)
    harness.operations.dispose()
  })

  it('核心登记失败时删除本次新建对话目录', async () => {
    const harness = await createHarness()
    harness.failCoreOnce()
    await expect(harness.operations.execute({ op: 'create-chat', name: 'failed-chat' })).rejects.toThrow('core create failed')
    expect(await canonicalize(join(root, 'chats', todayDirName(), 'failed-chat'))).toBeUndefined()
    expect(harness.registry().chats).toEqual([])
    harness.operations.dispose()
  })

  it('settings 写失败后删除本次目录，重试复用同一路径与核心行', async () => {
    const harness = await createHarness()
    const expectedPath = join(root, 'chats', todayDirName(), 'topic')
    harness.failSaveOnce()
    await expect(harness.operations.execute({ op: 'create-chat', name: 'topic' })).rejects.toThrow('settings write failed')
    expect(await canonicalize(expectedPath)).toBeUndefined()
    expect(harness.rows).toHaveLength(1)
    expect(harness.registry().chats).toEqual([])

    const result = await harness.operations.execute({ op: 'create-chat', name: 'topic' })
    expect((result.chat as SpaceRegistry['chats'][number]).path).toBe(expectedPath)
    expect(harness.rows).toHaveLength(1)
    expect(harness.registry().chats).toHaveLength(1)
    harness.operations.dispose()
  })

  it('核心行被外部删除后 rebind 建立新行并更新附加绑定', async () => {
    const harness = await createHarness()
    await harness.operations.execute({ op: 'create-space', name: 'workspace' })
    const oldId = harness.registry().spaces[0]!.workspaceId!
    harness.removeCore(oldId)
    const result = await harness.operations.execute({ op: 'rebind-space', space: 'workspace' })
    expect(result).toMatchObject({ healed: true })
    expect(result.workspaceId).not.toBe(oldId)
    expect(harness.registry().spaces[0]?.workspaceId).toBe(result.workspaceId)
    harness.operations.dispose()
  })
})
