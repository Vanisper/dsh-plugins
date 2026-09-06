// @vitest-environment jsdom
import type {
  ReactLike,
  RegistryItem,
  RegistryPayload,
  SessionService,
  WorkspaceService,
} from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createModeStore } from './mode.ts'
import { createSidebar } from './sidebar.ts'

const operation = vi.hoisted(() => vi.fn())
const fixture = vi.hoisted(() => ({
  registry: undefined as RegistryPayload | undefined,
}))
vi.mock('./api.ts', () => ({
  runOperation: operation,
  fetchRegistry: async () => fixture.registry,
}))
vi.mock('./registry.ts', () => ({
  observeRegistry: (receive: (value: RegistryPayload | undefined) => void) => {
    receive(fixture.registry)
    return () => {}
  },
}))

let cleanup: (() => Promise<void>) | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true
    },
    close(this: HTMLDialogElement) {
      this.open = false
    },
  })
  Object.assign(HTMLElement.prototype, { showPopover() {}, hidePopover() {} })
  Object.assign(window, { matchMedia: () => ({ matches: true }) })
  operation.mockReset().mockResolvedValue({})
})
afterEach(async () => {
  await cleanup?.()
  document.body.innerHTML = ''
  localStorage.clear()
})

async function mount(wide = true) {
  const item: RegistryItem = {
    kind: 'space',
    workspaceId: 'w',
    path: '/workspace',
    title: '演示空间',
    sessionIds: ['s'],
    revision: 'v1',
    primary: '/a',
    members: [
      { path: '/a', mode: 'reference' },
      { path: '/b', mode: 'reference' },
    ],
  }
  fixture.registry = {
    ok: true,
    root: '/root',
    items: [item],
    invalidSpaces: [],
    invalidChats: [],
  }
  const sessionSnapshot = {
    ids: ['s'],
    byId: {
      s: {
        id: 's',
        displayTitle: '已有会话',
        updatedAt: 1,
        running: false,
        blank: false,
      },
    },
    phase: 'ready' as const,
    current: 's',
  }
  const workspaceSnapshot = {
    items: [item],
    archivedSessionIds: [],
    phase: 'ready' as const,
    state: 'idle' as const,
    error: null,
    baselinesReady: true,
  }
  const sessions = {
    list: { subscribe: () => () => {}, getSnapshot: () => sessionSnapshot },
    searchResultLimit: 20,
    search: vi.fn(async () => ({
      ok: true,
      value: { items: [], hasMore: false },
    })),
    open: vi.fn(),
    fork: vi.fn(),
    binding: vi.fn(),
  } as unknown as SessionService
  const workspaces = {
    list: { subscribe: () => () => {}, getSnapshot: () => workspaceSnapshot },
    startSession: vi.fn(),
    create: vi.fn(),
    pickDirectory: vi.fn(async () => '/picked'),
    openPath: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    insertBefore: vi.fn(),
    insertSessionBefore: vi.fn(),
    archiveSession: vi.fn(),
  } as unknown as WorkspaceService
  const mode = createModeStore()
  const Sidebar = createSidebar(
    React as unknown as ReactLike,
    sessions,
    workspaces,
    mode,
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      createElement(Sidebar as React.ComponentType<{ wide: boolean }>, {
        wide,
      }),
    )
  })
  cleanup = async () => {
    await act(async () => root.unmount())
  }
  return { sessions, workspaces, mode, item }
}

function button(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    button =>
      button.getAttribute('aria-label') === label
      || button.textContent === label,
  )
  if (!button)
    throw new Error(`找不到按钮 ${label}`)
  return button
}
async function click(label: string): Promise<void> {
  await act(async () => button(label).click())
}
async function input(label: string, text: string): Promise<void> {
  const element = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )
  if (!element)
    throw new Error(`找不到输入 ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('侧栏交互', () => {
  it('成员修改是草稿，取消不写入且释放模式锁', async () => {
    const { mode } = await mount()
    await click('2 个成员 · 主要 a')
    expect(document.querySelector('dialog')?.open).toBe(true)
    expect(mode.getSnapshot().blocked).toBe(true)
    await click('将 b 设为主要')
    await click('移除成员 a')
    expect(operation).not.toHaveBeenCalled()
    await click('取消')
    expect(document.querySelector('dialog')).toBeNull()
    expect(mode.getSnapshot().blocked).toBe(false)
  })

  it('整份草稿一次保存，携带原版本，失败保留输入', async () => {
    await mount()
    await click('2 个成员 · 主要 a')
    await input('成员目录路径', '/c')
    await click('添加成员目录')
    operation.mockRejectedValueOnce(new Error('成员已在其他位置修改'))
    await click('保存')
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'save-members',
        expectedRevision: 'v1',
        members: expect.arrayContaining([{ path: '/c', mode: 'reference' }]),
      }),
    )
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      '其他位置修改',
    )
    expect(document.querySelectorAll('[data-member-path]')).toHaveLength(3)
  })

  it('快速重复保存只产生一个请求，提交期间关闭无效', async () => {
    await mount()
    await click('2 个成员 · 主要 a')
    let finish!: () => void
    operation.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    await act(async () => {
      button('保存').click()
      button('保存').click()
    })
    expect(operation).toHaveBeenCalledTimes(1)
    await act(async () =>
      document
        .querySelector('dialog')!
        .dispatchEvent(new Event('cancel', { cancelable: true })),
    )
    expect(document.querySelector('dialog')).not.toBeNull()
    await act(async () => finish())
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('escape 关闭弹窗并将焦点还给入口', async () => {
    await mount()
    const trigger = button('2 个成员 · 主要 a')
    trigger.focus()
    await click('2 个成员 · 主要 a')
    await act(async () =>
      document
        .querySelector('dialog')!
        .dispatchEvent(new Event('cancel', { cancelable: true })),
    )
    expect(document.activeElement).toBe(trigger)
  })

  it('当前会话所在组仍可手动折叠并记忆', async () => {
    await mount()
    const heading
      = document.querySelector<HTMLButtonElement>('.dsh-space-heading')!
    await act(async () => heading.click())
    expect(heading.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('dsh-space.sidebar.collapsed')).toContain('w')
    expect(document.querySelector('.dsh-space-session')).toBeNull()
  })

  it('收起侧栏也能显示创建弹窗，不依赖展开成功', async () => {
    await mount(false)
    await click('创建空间')
    expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe(
      '创建空间',
    )
  })

  it('会话入口为可聚焦按钮，未归组也保留操作', async () => {
    const { sessions } = await mount()
    await click('已有会话')
    expect(sessions.open).toHaveBeenCalledWith('s')
    expect(button('已有会话').getAttribute('aria-current')).toBe('page')
  })
})
