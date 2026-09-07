// @vitest-environment jsdom
import type { DraftHostConversation, DraftHostSessions } from './draft-host.ts'
import type { ReactLike, RegistryPayload, SessionSnapshot, WorkspaceService, WorkspaceSnapshot } from './types.ts'
import { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftComposer } from './draft-host.ts'
import { createModeStore } from './mode.ts'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const off of cleanups.splice(0).reverse())
    await off()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function store<T>(value: T) {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: T) {
      value = next
      listeners.forEach(listener => listener())
    },
  }
}

async function harness(official = false) {
  const registry: RegistryPayload = { ok: true, root: '/root', items: [], invalidChats: [], invalidSpaces: [] }
  const response = () => ({ ok: true, json: async (): Promise<Record<string, unknown>> => ({ ...registry, current: null, groups: [], failures: [], commands: [] }) })
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response())
  vi.stubGlobal('fetch', fetchMock)
  const realInput = { notify: vi.fn() }
  const list = store<SessionSnapshot>({ ids: ['official-session'], byId: {}, phase: 'ready' })
  const sessions = {
    list,
    clear: vi.fn(() => list.set({ ...list.getSnapshot(), current: undefined })),
    open: vi.fn((current: string) => list.set({ ...list.getSnapshot(), current })),
    create: vi.fn(),
    refresh: vi.fn(),
    scope: vi.fn(() => ({})),
  }
  const workspaces = {
    refresh: vi.fn(),
    list: store<WorkspaceSnapshot>({
      items: [{ workspaceId: 'project', path: '/project', title: '项目', sessionIds: ['official-session'] }],
      archivedSessionIds: [],
      state: 'idle',
      phase: 'ready',
      error: null,
      baselinesReady: true,
    }),
    startSession: vi.fn((_workspaceId?: string) => sessions.open('official-session')),
    initialSelectionStarted: false,
    startInitialSelection: () => {
      workspaces.initialSelectionStarted = true
      sessions.open('official-session')
      return () => {}
    },
  }
  const runtime = Object.assign((ctx: Context) => {
    ctx.reflect.provide('workspaces', workspaces, undefined)
    ctx.effect(() => workspaces.startInitialSelection(), 'runtime: initial Workspace selection')
  }, { createSnapshotStore: store })
  const ctx = new Context()
  const fiber = await ctx.plugin(runtime)
  cleanups.push(() => fiber.dispose())
  const require = (name: string): unknown => name === '@deepseek-ai/cordis' ? { Context } : name === '@deepseek-ai/dsh-client-runtime/client' ? runtime : {}
  function ConversationRoot() {
    return null
  }
  function InputBar() {
    return null
  }
  const entries = {
    'conversation': [{ component: ConversationRoot, options: {} }],
    'conversation.composer.bar': [{ component: InputBar, options: {} }],
  }
  const slots = {
    entries: (key: string) => entries[key as keyof typeof entries] ?? [],
    register: vi.fn(() => () => {}),
    inject: (_key: string, setup: () => () => void) => setup(),
  }
  const releaseDraftImage = vi.fn()
  const composer = createDraftComposer(React as unknown as ReactLike, require, ctx, slots, sessions as unknown as DraftHostSessions, workspaces as unknown as WorkspaceService, { releaseDraftImage, input: { for: () => realInput } } as unknown as DraftHostConversation)
  const mode = createModeStore()
  if (official)
    mode.setMode('official')
  else
    sessions.clear()
  const dispose = composer.install(mode, () => null)
  cleanups.push(dispose)
  return { ...composer, mode, sessions, workspaces, entries, releaseDraftImage, registry, response, fetchMock, realInput, dispose }
}

describe('草稿宿主的模式往返', () => {
  it.each([false, true])('官方自动选中真实会话后，切回恢复离开时的草稿（有内容：%s）', async (content) => {
    const h = await harness()
    h.draft.begin('project')
    if (content) {
      h.input.setDraft('保留草稿')
      h.input.addImages(['image'])
    }
    for (let i = 0; i < 2; i++) {
      h.mode.setMode('official')
      expect(h.entries['conversation.composer.bar'][0]?.component.name).toBe('InputBar')
      expect(h.sessions.list.getSnapshot().current).toBe('official-session')
      expect(h.draft.getSnapshot().active).toBe(false)
      // 非模式变化的通知不能覆盖离开时的编辑位置
      h.mode.setBlocked(true, 'test')
      h.mode.setBlocked(false, 'test')
      h.mode.setMode('space')
      expect(h.entries['conversation.composer.bar'][0]?.component.name).toBe('DraftBar')
      expect(h.sessions.list.getSnapshot().current).toBeUndefined()
      expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: 'project' })
      expect(h.input.snapshot).toMatchObject({ draft: content ? '保留草稿' : '', imageIds: content ? ['image'] : [] })
    }
    expect(h.releaseDraftImage).not.toHaveBeenCalled()
    expect(h.sessions.create).not.toHaveBeenCalled()
  })

  it('离开空间模式前已选中真实会话，切回不被后台草稿抢占', async () => {
    const h = await harness()
    h.input.setDraft('后台草稿')
    h.sessions.open('official-session')
    h.mode.setMode('official')
    h.mode.setMode('space')
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
    expect(h.draft.getSnapshot().active).toBe(false)
    expect(h.input.snapshot.draft).toBe('后台草稿')
  })

  it('以官方模式启动后切换空间模式，不凭空恢复未打开过的草稿', async () => {
    const h = await harness(true)
    h.mode.setMode('space')
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
    expect(h.draft.getSnapshot().active).toBe(false)
  })
})

describe('通用新会话的编辑上下文', () => {
  it.each(['plain', 'space'] as const)('聚焦 %s 中的真实会话时，沿用核心工作区归属', async (kind) => {
    const h = await harness()
    h.registry.items = [
      { kind, workspaceId: 'project', path: '/project', title: '项目', sessionIds: [] },
      { kind: 'chat', workspaceId: 'stale', path: '/stale', title: '旧描述', sessionIds: ['official-session'] },
    ]
    h.sessions.open('official-session')
    h.workspaces.startSession()
    await vi.waitFor(() => expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: 'project' }))
    expect(h.sessions.create).not.toHaveBeenCalled()
  })

  it('项目草稿态尚无真实会话时，沿用当前草稿目标', async () => {
    const h = await harness()
    h.draft.begin('project')
    h.input.setDraft('保留输入')
    h.workspaces.startSession()
    expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: 'project' })
    expect(h.input.snapshot.draft).toBe('保留输入')
    expect(h.sessions.create).not.toHaveBeenCalled()
  })

  it('独立对话的真实会话不复用其存储工作区，也不恢复后台项目草稿', async () => {
    const h = await harness()
    h.registry.items = [{ kind: 'chat', workspaceId: 'project', path: '/project', title: '独立对话', sessionIds: [] }]
    h.draft.begin('background-project')
    h.sessions.open('official-session')
    h.workspaces.startSession()
    await vi.waitFor(() => expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: undefined }))
    expect(h.fetchMock.mock.calls.every(([url]) => !url.endsWith('/ops'))).toBe(true)
    expect(h.sessions.create).not.toHaveBeenCalled()
  })

  it('独立草稿和未归属会话不沿用最近工作区，显式入口始终优先', async () => {
    const h = await harness()
    h.workspaces.list.set({ ...h.workspaces.list.getSnapshot(), recentWorkspaceId: 'project' })
    h.workspaces.startSession()
    expect(h.draft.getSnapshot().targetId).toBeUndefined()
    h.sessions.open('unowned')
    h.workspaces.startSession()
    expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: undefined })
    h.sessions.open('official-session')
    h.workspaces.startSession('explicit-project')
    expect(h.draft.getSnapshot().targetId).toBe('explicit-project')
    h.draft.begin()
    expect(h.draft.getSnapshot().targetId).toBeUndefined()
    expect(h.fetchMock.mock.calls.filter(([url]) => url.endsWith('/registry'))).toHaveLength(0)
  })

  it('核心归属未就绪时留在原会话，描述读取失败后可以重试', async () => {
    const h = await harness()
    h.sessions.open('official-session')
    h.workspaces.list.set({ ...h.workspaces.list.getSnapshot(), phase: 'pending' })
    h.workspaces.startSession()
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
    expect(h.realInput.notify).toHaveBeenLastCalledWith('error', expect.stringContaining('正在读取'))
    h.workspaces.list.set({ ...h.workspaces.list.getSnapshot(), phase: 'ready' })
    h.fetchMock.mockRejectedValueOnce(new Error('offline'))
    h.workspaces.startSession()
    await vi.waitFor(() => expect(h.realInput.notify).toHaveBeenLastCalledWith('error', expect.stringContaining('offline')))
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
    expect(h.draft.getSnapshot().active).toBe(false)
    h.workspaces.startSession()
    await vi.waitFor(() => expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: 'project' }))
  })

  it.each(['navigate', 'draft', 'official', 'dispose'] as const)('读取期间发生 %s，迟到响应不能改变新选择', async (action) => {
    const h = await harness()
    let resolve!: () => void
    h.fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((done) => {
        resolve = done
      })
      return h.response()
    })
    h.sessions.open('official-session')
    h.workspaces.startSession()
    const signal = h.fetchMock.mock.lastCall?.[1]?.signal
    if (action === 'navigate') {
      h.sessions.open('another-session')
      h.sessions.open('official-session')
    }
    else if (action === 'draft') {
      h.draft.begin('explicit-project')
    }
    else if (action === 'official') {
      h.mode.setMode('official')
      h.mode.setMode('space')
    }
    else {
      h.dispose()
    }
    const current = h.sessions.list.getSnapshot().current
    const state = h.draft.getSnapshot()
    expect(signal?.aborted).toBe(true)
    resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(h.sessions.list.getSnapshot().current).toBe(current)
    expect(h.draft.getSnapshot()).toEqual(state)
    expect(h.realInput.notify).not.toHaveBeenCalled()
  })

  it('会话摘要刷新不取消读取，归属变更则拒绝应用旧结果', async () => {
    const h = await harness()
    let resolve!: () => void
    h.fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((done) => {
        resolve = done
      })
      return h.response()
    })
    h.sessions.open('official-session')
    h.workspaces.startSession()
    const signal = h.fetchMock.mock.lastCall?.[1]?.signal
    h.sessions.list.set({ ...h.sessions.list.getSnapshot() })
    expect(signal?.aborted).toBe(false)
    h.workspaces.list.set({ ...h.workspaces.list.getSnapshot(), items: [] })
    resolve()
    await vi.waitFor(() => expect(h.realInput.notify).toHaveBeenLastCalledWith('error', expect.stringContaining('已变化')))
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
  })

  it('连续点击只应用最新结果，官方模式恢复原新建行为', async () => {
    const h = await harness()
    let resolve!: () => void
    h.fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((done) => {
        resolve = done
      })
      return h.response()
    })
    h.sessions.open('official-session')
    h.workspaces.startSession()
    const signal = h.fetchMock.mock.lastCall?.[1]?.signal
    h.workspaces.startSession()
    expect(signal?.aborted).toBe(true)
    await vi.waitFor(() => expect(h.draft.getSnapshot().targetId).toBe('project'))
    h.draft.setTarget('different-project')
    resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(h.draft.getSnapshot().targetId).toBe('different-project')
    h.mode.setMode('official')
    h.workspaces.startSession()
    expect(h.workspaces.startSession).toHaveBeenCalledOnce()
    expect(h.sessions.list.getSnapshot().current).toBe('official-session')
  })

  it('创建失败后的目标锁和重试身份不被通用新建解除', async () => {
    const h = await harness()
    h.draft.begin('project')
    h.sessions.create.mockRejectedValueOnce(new Error('offline'))
    await expect(h.draft.submit({ text: '内容', imageIds: [] }, new AbortController().signal)).rejects.toThrow('offline')
    const failed = h.draft.getSnapshot()
    h.workspaces.startSession()
    expect(h.draft.getSnapshot()).toMatchObject({ active: true, targetId: 'project', creationId: failed.creationId, requestedSessionId: failed.requestedSessionId })
    h.workspaces.startSession('different-project')
    expect(h.draft.getSnapshot()).toMatchObject({ targetId: 'project', creationId: failed.creationId, error: expect.stringContaining('创建已开始') })
  })
})
