import type { Context } from '@deepseek-ai/cordis'
import type { SpacesStore } from '../store/spaces.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { dispatchOp } from './http.ts'

let root: string
let dirA: string
let saved: { spaces: unknown[], chats: unknown[] }
let store: SpacesStore
let fakeCtx: Context
let registryCalls: { path: string, title?: string }[]
let registryRows: { id: string, path: string }[]

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-http-root-'))))!
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-http-a-'))))!
  saved = { spaces: [], chats: [] }
  registryCalls = []
  registryRows = []
  fakeCtx = {
    // 最小结构投影：create 与 list 都被 rebind/heal 链路使用
    get: (name: string) => {
      if (name === 'workspaceRegistry') {
        return {
          create: async (path: string, title?: string) => {
            registryCalls.push({ path, title })
            const row = { id: `ws-${registryCalls.length}`, path }
            registryRows.push(row)
            return row
          },
          list: () => registryRows,
        }
      }
      return undefined
    },
  } as unknown as Context
  store = {
    listSpaces: () => saved.spaces as never,
    listChats: () => saved.chats as never,
    save: async (spaces, chats) => {
      saved.spaces = spaces
      saved.chats = chats
    },
    root: () => root,
    watch: () => () => {},
  }
})

afterEach(async () => {
  for (const dir of [root, dirA])
    await rm(dir, { recursive: true, force: true })
})

describe('dispatchOp（HTTP ops 与工具/命令同域函数）', () => {
  it('create-space：建壳 + 幂等登记绑定，一次落库', async () => {
    const result = await dispatchOp(fakeCtx, store, { op: 'create-space', name: '甲', folder: dirA })
    expect((result.space as { workspaceId?: string }).workspaceId).toBe('ws-1')
    expect(registryCalls[0]?.path).toBe(join(root, 'spaces', '甲'))
    expect(saved.spaces).toHaveLength(1)
    expect(saved.chats).toEqual([])
  })

  it('chat：静默建目录 + 登记绑定', async () => {
    const result = await dispatchOp(fakeCtx, store, { op: 'chat', name: '调研' })
    const chat = result.chat as { path: string, workspaceId?: string }
    expect(chat.path).toContain(join(root, 'chats'))
    expect(chat.workspaceId).toBe('ws-1')
    expect(saved.chats).toHaveLength(1)
  })

  it('attach/detach/primary 全链路可用', async () => {
    await dispatchOp(fakeCtx, store, { op: 'create-space', name: '甲' })
    const attached = await dispatchOp(fakeCtx, store, { op: 'attach', space: '甲', target: dirA })
    expect((attached.folder as { path: string }).path).toBe(dirA)
    const primed = await dispatchOp(fakeCtx, store, { op: 'primary', space: '甲', target: dirA })
    expect(primed.primary).toBe(dirA)
    const detached = await dispatchOp(fakeCtx, store, { op: 'detach', space: '甲', target: dirA })
    expect((detached.detached as { path: string }).path).toBe(dirA)
  })

  it('域错误以异常抛出（handler 统一转 400）', async () => {
    await expect(dispatchOp(fakeCtx, store, { op: 'create-space' })).rejects.toThrow('name')
    await expect(dispatchOp(fakeCtx, store, { op: 'nope' })).rejects.toThrow('未知 op')
  })

  it('rebind（按需治愈）：行在→原样；行删→幂等重建并更新绑定', async () => {
    await dispatchOp(fakeCtx, store, { op: 'create-space', name: '甲' })
    // 行在：原样返回，不新增登记
    const healthy = await dispatchOp(fakeCtx, store, { op: 'rebind', space: '甲' })
    expect(healthy).toMatchObject({ workspaceId: 'ws-1', healed: false })
    // 模拟用户在核心 UI 删行 → 悬空
    registryRows.length = 0
    const healed = await dispatchOp(fakeCtx, store, { op: 'rebind', space: '甲' })
    expect(healed).toMatchObject({ healed: true })
    const savedSpace = (saved.spaces as Array<{ workspaceId?: string }>)[0]
    expect(savedSpace?.workspaceId).toBe(healed.workspaceId)
    // 对话同理
    await dispatchOp(fakeCtx, store, { op: 'chat', name: '临时' })
    registryRows.length = 0
    const healedChat = await dispatchOp(fakeCtx, store, { op: 'rebind', chat: '临时' })
    expect(healedChat).toMatchObject({ healed: true })
  })

  it('reorder-spaces：重排数组即重排展示序；集合不一致拒绝', async () => {
    await dispatchOp(fakeCtx, store, { op: 'create-space', name: '甲' })
    await dispatchOp(fakeCtx, store, { op: 'create-space', name: '乙' })
    const ids = (saved.spaces as Array<{ id: string, name: string }>).map(s => s.id)
    const reversed = [...ids].reverse()
    const result = await dispatchOp(fakeCtx, store, { op: 'reorder-spaces', ids: reversed })
    expect(result).toMatchObject({ reordered: 2 })
    expect((saved.spaces as Array<{ name: string }>).map(s => s.name)).toEqual(['乙', '甲'])
    await expect(dispatchOp(fakeCtx, store, { op: 'reorder-spaces', ids: [ids[0]] })).rejects.toThrow('不一致')
  })

  it('drop/chatdrop 只删记录', async () => {
    await dispatchOp(fakeCtx, store, { op: 'create-space', name: '甲' })
    await dispatchOp(fakeCtx, store, { op: 'chat', name: '临时' })
    await dispatchOp(fakeCtx, store, { op: 'chatdrop', ref: '临时' })
    expect(saved.chats).toEqual([])
    await dispatchOp(fakeCtx, store, { op: 'drop', space: '甲' })
    expect(saved.spaces).toEqual([])
  })
})
