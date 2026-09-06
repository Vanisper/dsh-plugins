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
  receive: undefined as ((value: RegistryPayload | undefined, error?: string) => void) | undefined,
}))
vi.mock('./api.ts', () => ({
  runOperation: operation,
  fetchRegistry: async () => fixture.registry,
}))
vi.mock('./registry.ts', () => ({
  observeRegistry: (receive: (value: RegistryPayload | undefined) => void) => {
    fixture.receive = receive
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  fixture.receive = undefined
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
    refresh: vi.fn(async () => {}),
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
  return { sessions, workspaces, mode, item, workspaceSnapshot, sessionSnapshot }
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
  ) ?? Array.from(document.querySelectorAll('input')).find(input =>
    Array.from(input.labels ?? []).some(node => node.textContent === label),
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

async function registry(value: RegistryPayload | undefined): Promise<void> {
  fixture.registry = value
  await act(async () => fixture.receive?.(value, value ? undefined : 'offline'))
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

  it('初始焦点跳过折叠详情中的输入，即使浏览器仍返回其布局尺寸', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    await mount()
    await click('2 个成员 · 主要 a')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('成员目录路径')
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
    const { sessions, sessionSnapshot } = await mount()
    await click('已有会话')
    expect(sessions.open).toHaveBeenCalledWith('s')
    expect(button('已有会话').getAttribute('aria-current')).toBe('page')
    sessionSnapshot.ids.push('misc')
    Object.assign(sessionSnapshot.byId, {
      misc: { id: 'misc', displayTitle: '未归组会话', blank: false, running: false, updatedAt: 1 },
    })
    await registry({ ...fixture.registry! })
    await click('未归组会话')
    expect(sessions.open).toHaveBeenLastCalledWith('misc')
    expect(button('未归组会话 会话操作')).toBeDefined()
  })

  it('选择目录期间不能保存或关闭，完成后恢复草稿编辑', async () => {
    const { workspaces } = await mount()
    let finish!: (path: string) => void
    vi.mocked(workspaces.pickDirectory).mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    await click('2 个成员 · 主要 a')
    await click('选择成员目录')
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    await act(async () => document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(document.querySelector('dialog')).not.toBeNull()
    expect(operation).not.toHaveBeenCalled()
    await act(async () => finish('/picked'))
    expect(document.querySelectorAll('[data-member-path]')).toHaveLength(3)
    expect(button('保存').disabled).toBe(false)
  })

  it('创建成功但列表未同步时锁定已提交草稿，重试只进入原工作区', async () => {
    vi.useFakeTimers()
    const { workspaces } = await mount(false)
    await click('创建空间')
    await input('空间名称', '新空间')
    operation.mockResolvedValueOnce({ space: { workspaceId: 'new' } })
    await click('创建空间')
    await act(async () => vi.advanceTimersByTimeAsync(5100))
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    expect(document.querySelector('dialog')?.textContent).toContain('工作区已创建')
    expect(button('进入工作区').disabled).toBe(false)
    const original = workspaces.list.getSnapshot
    const updated = {
      ...original(),
      items: [...original().items, { workspaceId: 'new', path: '/new', title: '新空间', sessionIds: [] }],
    }
    workspaces.list.getSnapshot = () => updated
    await click('进入工作区')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(workspaces.startSession).toHaveBeenCalledWith('new')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('核心删除失败后重试不重复移除描述', async () => {
    const { workspaces } = await mount()
    vi.mocked(workspaces.delete).mockRejectedValueOnce(new Error('断线')).mockResolvedValueOnce()
    await click('移除工作区')
    await click('移除工作区')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(document.querySelector('dialog')?.textContent).toContain('附加描述已移除')
    await registry({ ...fixture.registry!, items: [{ ...fixture.registry!.items[0]!, kind: 'plain', revision: undefined }] })
    await click('移除工作区')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(workspaces.delete).toHaveBeenCalledTimes(2)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('删除重试发现工作区已重新增强时停止，不清理新描述', async () => {
    const { workspaces } = await mount()
    vi.mocked(workspaces.delete).mockRejectedValueOnce(new Error('断线'))
    await click('移除工作区')
    await click('移除工作区')
    await registry({ ...fixture.registry!, items: [{ ...fixture.registry!.items[0]!, revision: 'v2' }] })
    await click('移除工作区')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(workspaces.delete).toHaveBeenCalledTimes(1)
    expect(document.querySelector('dialog')?.textContent).toContain('核心登记或附加描述已变更')
  })

  it('描述降级禁用移除；打开确认后发生降级也不可提交', async () => {
    const { workspaces } = await mount()
    await click('移除工作区')
    await registry(undefined)
    expect(button('移除工作区').disabled).toBe(true)
    await click('取消')
    expect(button('移除工作区').disabled).toBe(true)
    expect(operation).not.toHaveBeenCalled()
    expect(workspaces.delete).not.toHaveBeenCalled()
  })

  it('移除前重新核对描述版本，不能清理其他页面刚修改的空间', async () => {
    const { workspaces } = await mount()
    await click('移除工作区')
    fixture.registry = { ...fixture.registry!, items: [{ ...fixture.registry!.items[0]!, revision: 'v2' }] }
    await click('移除工作区')
    expect(document.querySelector('dialog')?.textContent).toContain('工作区描述已变更')
    expect(operation).not.toHaveBeenCalled()
    expect(workspaces.delete).not.toHaveBeenCalled()
  })

  it('失效描述先确认，再校验仍然失效才清理', async () => {
    await mount()
    await registry({ ...fixture.registry!, invalidSpaces: [{ workspaceId: 'gone', status: 'missing-workspace' }] })
    await click('1 条失效描述')
    await click('清理 gone')
    expect(operation).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe('清理失效描述')
    await click('确认清理')
    expect(operation).toHaveBeenCalledWith({ op: 'drop-space', workspace: 'gone' })
  })

  it('失效记录状态变化后拒绝确认清理', async () => {
    await mount()
    await registry({ ...fixture.registry!, invalidSpaces: [{ workspaceId: 'gone', status: 'missing-workspace' }] })
    await click('1 条失效描述')
    await click('清理 gone')
    fixture.registry = { ...fixture.registry!, invalidSpaces: [] }
    await click('确认清理')
    expect(operation).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')?.textContent).toContain('记录状态已变更')
  })

  it('核心加载失败通过宿主服务刷新，不离开当前页面', async () => {
    const { workspaces, workspaceSnapshot } = await mount()
    Object.assign(workspaceSnapshot, { state: 'error', error: { message: '断线' } })
    await registry({ ...fixture.registry! })
    await click('重新连接')
    expect(workspaces.refresh).toHaveBeenCalledTimes(1)
  })

  it('宿主服务同步抛错仍显示错误并释放提交锁', async () => {
    const { workspaces, mode } = await mount()
    vi.mocked(workspaces.openPath).mockImplementation(() => {
      throw new Error('连接尚未就绪')
    })
    await click('打开目录')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('连接尚未就绪')
    expect(mode.getSnapshot().blocked).toBe(false)
  })

  it('空白会话保留宿主标题，不提供无法执行的分叉操作', async () => {
    const { sessionSnapshot } = await mount()
    sessionSnapshot.byId.s.blank = true
    await registry({ ...fixture.registry! })
    expect(button('已有会话')).toBeDefined()
    expect(button('分叉会话').disabled).toBe(true)
  })

  it('全文命中并入核心会话元数据，展示匹配片段', async () => {
    vi.useFakeTimers()
    const { sessions } = await mount()
    vi.mocked(sessions.search).mockResolvedValueOnce({ ok: true, value: {
      items: [{ sessionId: 's', snippet: '正文中的命中片段' }],
      hasMore: false,
    } })
    await input('搜索会话或工作区', '正文')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(sessions.search).toHaveBeenCalledWith('正文', expect.any(AbortSignal))
    expect(document.querySelector('.dsh-space-list')?.textContent).toContain('正文中的命中片段')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('全文失败保留标题匹配，重试成功后移除错误状态', async () => {
    vi.useFakeTimers()
    const { sessions } = await mount()
    vi.mocked(sessions.search).mockResolvedValueOnce({ ok: false, error: { message: '索引未开启' } })
    await input('搜索会话或工作区', '已有会话')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(document.querySelector('.dsh-space-list')?.textContent).toContain('已有会话')
    expect(document.querySelector('[role="alert"]')?.getAttribute('title')).toBe('索引未开启')
    await click('重试搜索')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(sessions.search).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
