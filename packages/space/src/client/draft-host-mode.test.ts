// @vitest-environment jsdom
import type { DraftHostConversation, DraftHostSessions } from './draft-host.ts'
import type { ReactLike, SessionSnapshot, WorkspaceService } from './types.ts'
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
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ current: null, groups: [], failures: [], commands: [] }) })))
  const list = store<SessionSnapshot>({ ids: ['official-session'], byId: {}, phase: 'ready' })
  const sessions = {
    list,
    clear: vi.fn(() => list.set({ ...list.getSnapshot(), current: undefined })),
    open: vi.fn((current: string) => list.set({ ...list.getSnapshot(), current })),
    create: vi.fn(),
    refresh: vi.fn(),
  }
  const workspaces = {
    startSession: vi.fn(() => sessions.open('official-session')),
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
  const composer = createDraftComposer(React as unknown as ReactLike, require, ctx, slots, sessions as unknown as DraftHostSessions, workspaces as unknown as WorkspaceService, { releaseDraftImage } as unknown as DraftHostConversation)
  const mode = createModeStore()
  if (official)
    mode.setMode('official')
  else
    sessions.clear()
  cleanups.push(composer.install(mode, () => null))
  return { ...composer, mode, sessions, workspaces, entries, releaseDraftImage }
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
