// @vitest-environment jsdom
import type { ConversationService, ReactLike, SessionService, SessionSnapshot, SlotsService, WorkspaceService } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModeStore } from './mode.ts'
import { createHostPreparation, installPreparation } from './preparation-host.ts'

const operation = vi.hoisted(() => vi.fn())
vi.mock('./api.ts', () => ({ runOperation: operation }))

afterEach(() => {
  operation.mockReset()
  vi.useRealTimers()
  localStorage.clear()
  document.body.innerHTML = ''
})

function setup() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const row = { id: 's', blank: true, displayTitle: '空白', running: false, updatedAt: 0 }
  let snapshot: SessionSnapshot = { current: 'old', ids: ['s'], byId: { s: row }, phase: 'ready' }
  const listeners = new Set<() => void>()
  const sessions = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => {
          listeners.delete(fn)
        }
      },
    },
    open: vi.fn((id: string) => {
      snapshot = { ...snapshot, current: id }
      listeners.forEach(fn => fn())
    }),
    scope: vi.fn(() => ({ id: 'scope' })),
  } as unknown as SessionService
  const workspaces = {
    refresh: vi.fn(async () => {}),
    connectWorkspace: vi.fn(async () => 's'),
    list: { getSnapshot: () => ({ items: [{ workspaceId: 'w' }] }) },
  } as unknown as WorkspaceService
  const inputState = { draft: '', imageIds: [] as string[], phase: 'plain' }
  const input = {
    state: { getSnapshot: () => inputState },
    setDraft: vi.fn((value: string) => { inputState.draft = value }),
    submit: vi.fn(),
    notify: vi.fn(),
  }
  let block: { reason: string } | undefined
  const conversation = {
    input: { for: () => input },
    blocks: { storeFor: () => ({ getSnapshot: () => block }) },
  } as unknown as ConversationService
  const preparation = createHostPreparation(sessions, workspaces, conversation)
  return {
    preparation,
    sessions,
    workspaces,
    input,
    inputState,
    row,
    setBlock: (value: { reason: string }) => {
      block = value
    },
  }
}

function install(h: ReturnType<typeof setup>) {
  const mode = createModeStore()
  const entries = new Map<string, (props: never) => unknown>()
  const slots: SlotsService = {
    inject: (_name, factory) => factory(),
    register: (options, component) => {
      entries.set(options.name as string, component)
      return () => {
        entries.delete(options.name as string)
      }
    },
  }
  const dispose = installPreparation(React as unknown as ReactLike, slots, h.sessions, mode, h.preparation, () => null, () => null)
  return { mode, entries, dispose }
}

describe('官方准备页接入', () => {
  it('输入挂载后交接，重复挂载不重复发送', async () => {
    const h = setup()
    const { mode, entries, dispose } = install(h)
    h.preparation.begin('w')
    h.preparation.setDraft('/help')
    expect(entries.has('conversation')).toBe(true)
    await h.preparation.connect(true)
    expect(entries.has('conversation')).toBe(false)
    expect(h.input.submit).not.toHaveBeenCalled()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    const Dock = entries.get('conversation.input.dock') as React.ComponentType<{ sessionId: string }>
    try {
      await act(async () => root.render(createElement(Dock, { sessionId: 's' })))
      expect(h.input.setDraft).toHaveBeenCalledExactlyOnceWith('/help')
      expect(h.input.submit).toHaveBeenCalledTimes(1)
      expect(mode.getSnapshot().blocked).toBe(false)
      mode.setMode('official')
      expect(entries.size).toBe(0)
      mode.setMode('space')
      expect(entries.has('conversation.input.dock')).toBe(true)
    }
    finally {
      await act(async () => root.unmount())
      dispose()
    }
    expect(entries.size).toBe(0)
  })

  it.each(['text', 'image'])('原输入区已有 %s 时两份草稿都保留，不覆盖、不发送', async (kind) => {
    const h = setup()
    h.inputState.draft = kind === 'text' ? '原草稿' : ''
    h.inputState.imageIds = kind === 'image' ? ['attachment'] : []
    const original = structuredClone(h.inputState)
    h.preparation.begin('w')
    h.preparation.setDraft('准备草稿')
    await h.preparation.connect(true)
    h.preparation.deliver('s')
    expect(h.inputState).toEqual(original)
    expect(h.preparation.getSnapshot()).toMatchObject({ draft: '准备草稿', phase: 'editing' })
    expect(h.preparation.getSnapshot().error).toContain('已有未发送内容')
    expect(h.input.submit).not.toHaveBeenCalled()
  })

  it('模型阻止发送时交接草稿并显示宿主原因，不绕过配置', async () => {
    const h = setup()
    h.setBlock({ reason: '请先选择模型' })
    h.preparation.begin('w')
    h.preparation.setDraft('内容')
    await h.preparation.connect(true)
    h.preparation.deliver('s')
    expect(h.inputState.draft).toBe('内容')
    expect(h.input.submit).not.toHaveBeenCalled()
    expect(h.input.notify).toHaveBeenCalledWith('info', expect.stringContaining('请先选择模型'))
    expect(h.preparation.getSnapshot().active).toBe(false)
  })

  it('目标会话被其他页面开始后不自动追加新草稿', async () => {
    const h = setup()
    h.preparation.begin('w')
    h.preparation.setDraft('内容')
    await h.preparation.connect(true)
    h.row.blank = false
    h.preparation.deliver('s')
    expect(h.input.submit).not.toHaveBeenCalled()
    expect(h.preparation.getSnapshot().error).toContain('目标会话已开始')
  })

  it('刷新超时不在迟到结果后连接会话，草稿与占用可恢复', async () => {
    vi.useFakeTimers()
    const h = setup()
    let finish!: () => void
    vi.mocked(h.workspaces.refresh).mockReturnValueOnce(new Promise<void>((resolve) => {
      finish = resolve
    }))
    h.preparation.begin('w')
    h.preparation.setDraft('内容')
    const pending = h.preparation.connect(true)
    await vi.advanceTimersByTimeAsync(15001)
    await pending
    expect(h.preparation.getSnapshot().error).toContain('超时')
    finish()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.workspaces.connectWorkspace).not.toHaveBeenCalled()
    expect(h.sessions.open).not.toHaveBeenCalled()
  })

  it('输入挂载超时恢复准备页并释放占用，重试只交接已连接的会话', async () => {
    vi.useFakeTimers()
    const h = setup()
    const { mode, entries, dispose } = install(h)
    try {
      h.preparation.begin('w')
      h.preparation.setDraft('保留内容')
      await h.preparation.connect(true)
      expect(mode.getSnapshot().blocked).toBe(true)
      await vi.advanceTimersByTimeAsync(8001)
      expect(h.preparation.getSnapshot()).toMatchObject({ phase: 'editing', active: true, draft: '保留内容', sessionId: 's' })
      expect(h.preparation.getSnapshot().error).toContain('未就绪')
      expect(entries.has('conversation')).toBe(true)
      expect(mode.getSnapshot().blocked).toBe(false)
      await h.preparation.connect(true)
      h.preparation.deliver('s')
      expect(h.workspaces.connectWorkspace).toHaveBeenCalledTimes(1)
      expect(h.input.submit).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      dispose()
    }
  })

  it('交接期间的模式切换延后到结束，随后释放全部增强注册', async () => {
    const h = setup()
    const { mode, entries, dispose } = install(h)
    try {
      h.preparation.begin('w')
      h.preparation.setDraft('内容')
      await h.preparation.connect(true)
      mode.setMode('official')
      expect(mode.getSnapshot()).toEqual({ mode: 'space', blocked: true })
      h.preparation.deliver('s')
      expect(mode.getSnapshot()).toEqual({ mode: 'official', blocked: false })
      expect(entries.size).toBe(0)
      expect(h.input.submit).toHaveBeenCalledTimes(1)
    }
    finally {
      dispose()
    }
  })

  it('交接时导航离开会保留草稿、取消计时，迟到挂载不发送', async () => {
    vi.useFakeTimers()
    const h = setup()
    const { mode, entries, dispose } = install(h)
    try {
      h.preparation.begin('w')
      h.preparation.setDraft('未发送')
      await h.preparation.connect(true)
      h.sessions.open('other')
      h.preparation.deliver('s')
      expect(h.preparation.getSnapshot()).toMatchObject({ active: false, phase: 'editing', draft: '未发送' })
      expect(h.input.submit).not.toHaveBeenCalled()
      expect(entries.has('conversation')).toBe(false)
      expect(mode.getSnapshot().blocked).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      dispose()
    }
  })
})
