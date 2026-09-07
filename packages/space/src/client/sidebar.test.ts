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
import { createDraftSession } from './draft-session.ts'
import { createLayoutStore } from './layout.ts'
import { createModeStore } from './mode.ts'
import { createSidebar } from './sidebar.ts'
import { sidebarCss } from './styles.ts'

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
  operation.mockReset().mockImplementation(async (input) => {
    if (input.op !== 'save-members' && input.op !== 'enhance-space')
      return {}
    const source = fixture.registry!.items.find(item => item.workspaceId === input.workspace)!
    const space = { ...source, kind: 'space' as const, members: input.members, primary: input.primary, revision: 'v2' }
    fixture.registry = { ...fixture.registry!, items: fixture.registry!.items.map(item => item.workspaceId === source.workspaceId ? space : item) }
    return { space }
  })
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
    current: 's' as string | undefined,
  }
  const workspaceSnapshot = {
    items: [item],
    archivedSessionIds: [] as string[],
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
  const draft = createDraftSession({
    clearSelection: () => { sessionSnapshot.current = undefined },
    allocate: vi.fn(),
    create: vi.fn(),
    adopt: vi.fn(),
  })
  const beginDraft = vi.fn(draft.begin)
  draft.begin = beginDraft
  const Sidebar = createSidebar(
    React as unknown as ReactLike,
    sessions,
    workspaces,
    mode,
    draft,
    { StateDot: ({ state }) => createElement('span', { 'data-native-state': state, 'aria-hidden': true }) },
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const setWide = async (wide: boolean): Promise<void> => act(async () => {
    root.render(
      createElement(Sidebar as React.ComponentType<{ wide: boolean }>, {
        wide,
      }),
    )
  })
  await setWide(wide)
  cleanup = async () => {
    await act(async () => root.unmount())
    draft.dispose()
  }
  return { sessions, workspaces, mode, draft, beginDraft, item, workspaceSnapshot, sessionSnapshot, setWide }
}

function button(label: string): HTMLButtonElement {
  const scope = document.querySelector('dialog') ?? document
  const buttons = [...(scope.querySelector('.dsh-space-details')?.querySelectorAll('button') ?? []), ...scope.querySelectorAll('button')]
  const button = buttons.find(button => button.getAttribute('aria-label') === label) ?? buttons.find(button => button.textContent === label)
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

it('视图按分组、项目排列且默认选中项目，键盘顺序与视觉一致', async () => {
  await mount()
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
  expect(tabs.map(tab => tab.textContent)).toEqual(['分组', '项目'])
  expect(tabs[1]!.getAttribute('aria-checked')).toBe('true')
  await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
  expect(tabs[0]!.getAttribute('aria-checked')).toBe('true')
  expect(document.activeElement).toBe(tabs[0])
  await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
  expect(tabs[1]!.getAttribute('aria-checked')).toBe('true')
  expect(document.activeElement).toBe(tabs[1])
  await act(async () => document.querySelector<HTMLButtonElement>('.dsh-space-head [role="menuitem"]')!.click())
  expect([...document.querySelectorAll('.dsh-space-section-title')].map(node => node.textContent)).toEqual(['置顶', '对话', '项目'])
})

it('搜索同一行展开并聚焦，关闭清空筛选且恢复入口焦点', async () => {
  await mount()
  const wrap = document.querySelector('.dsh-space-search-wrap')!
  const field = document.querySelector<HTMLInputElement>('.dsh-space-search')!
  expect(wrap.hasAttribute('inert')).toBe(true)
  await click('搜索')
  expect(wrap.hasAttribute('inert')).toBe(false)
  expect(document.querySelector('.dsh-space-view-toolbar')?.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).toBe(field)
  await input('搜索项目或会话', '不匹配')
  expect(document.querySelector('[data-section="workspaces"]')).toBeNull()
  await click('关闭搜索')
  expect(field.value).toBe('')
  expect(wrap.hasAttribute('inert')).toBe(true)
  expect(document.querySelector('[data-section="workspaces"]')).not.toBeNull()
  expect(document.activeElement).toBe(button('搜索'))
})

it('大组折叠箭头常驻，展开未悬停时隐藏，项目行仍无折叠箭头', async () => {
  await mount()
  const style = document.createElement('style')
  style.textContent = sidebarCss
  document.body.append(style)
  const title = button('项目')
  expect(getComputedStyle(title.querySelector('svg')!).opacity).toBe('0')
  await click('项目')
  expect(title.getAttribute('aria-expanded')).toBe('false')
  expect(getComputedStyle(title.querySelector('svg')!).opacity).toBe('1')
  await click('项目')
  expect(getComputedStyle(title.querySelector('svg')!).opacity).toBe('0')
  expect(document.querySelector('.dsh-space-heading>svg')).toBeNull()
})

it('搜索 Escape 避开输入法组字及 229 按键，正常 Escape 关闭', async () => {
  await mount()
  await click('搜索')
  const field = document.querySelector<HTMLInputElement>('.dsh-space-search')!
  await input('搜索项目或会话', 'ceshi')
  await act(async () => {
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true }))
  })
  expect(field.value).toBe('ceshi')
  expect(document.querySelector('.searching')).not.toBeNull()
  await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(field.value).toBe('')
  expect(document.querySelector('.searching')).toBeNull()
  expect(document.activeElement).toBe(button('搜索'))
})

it('窄栏搜索入口在展开侧栏后聚焦，关闭时忽略过期全文结果', async () => {
  vi.useFakeTimers()
  const { setWide, sessions } = await mount(false)
  await click('搜索会话')
  await setWide(true)
  expect(document.activeElement).toBe(document.querySelector('.dsh-space-search'))
  let finish!: (value: Awaited<ReturnType<SessionService['search']>>) => void
  vi.mocked(sessions.search).mockImplementationOnce(() => new Promise((resolve) => {
    finish = resolve
  }))
  await input('搜索项目或会话', '正文')
  await act(async () => vi.advanceTimersByTimeAsync(300))
  const signal = vi.mocked(sessions.search).mock.calls[0]![1]!
  await click('关闭搜索')
  expect(signal.aborted).toBe(true)
  await act(async () => finish({ ok: true, value: { items: [{ sessionId: 's', snippet: '过期片段' }], hasMore: false } }))
  await click('搜索')
  expect(document.querySelector('.dsh-space-list')?.textContent).not.toContain('过期片段')
  expect(document.querySelector('[data-section="workspaces"]')).not.toBeNull()
})

it('空闲会话保留左侧占位但不显示状态图形', async () => {
  await mount()
  const slot = document.querySelector('.dsh-space-session-main .dsh-space-status')!
  expect(slot).not.toBeNull()
  expect(slot.querySelector('[data-native-state]')).toBeNull()
  expect(slot.getAttribute('role')).toBeNull()
})

it.each([
  [{ running: true }, 'ongoing', '运行中'],
  [{ completed: true }, 'done', '完成未读'],
  [{ running: true, completed: true, pendingInteraction: 'approval' }, 'warning', '等待审批'],
  [{ pendingInteraction: 'plan-review' }, 'warning', '等待计划审阅'],
  [{ pendingInteraction: 'question' }, 'warning', '等待回答'],
] as const)('会话状态映射到原生标识 %j', async (state, nativeState, label) => {
  const { sessionSnapshot } = await mount()
  Object.assign(sessionSnapshot.byId.s, state)
  await registry({ ...fixture.registry! })
  const slot = document.querySelector('.dsh-space-session-main .dsh-space-status')!
  expect(slot.getAttribute('aria-label')).toBe(label)
  expect(slot.querySelector('[data-native-state]')?.getAttribute('data-native-state')).toBe(nativeState)
})

it('仅子代理运行时仍显示进行中，不误判为空闲', async () => {
  const { sessionSnapshot } = await mount()
  sessionSnapshot.ids.push('child')
  Object.assign(sessionSnapshot.byId, { child: { id: 'child', parentId: 's', origin: 'subagent', running: true, blank: false } })
  await registry({ ...fixture.registry! })
  expect(document.querySelector('.dsh-space-status')?.getAttribute('aria-label')).toBe('1 个子代理运行中')
  expect(document.querySelector('[data-native-state]')?.getAttribute('data-native-state')).toBe('ongoing')
})

it('成员只在浮层展示，主成员排首位且不重复名称路径或主要标记', async () => {
  const { workspaces, item } = await mount()
  await registry({ ...fixture.registry!, items: [{ ...item, primary: '/b', members: [{ path: '/a', mode: 'reference' }, { path: '/b', mode: 'reference', title: '后端' }] }] })
  expect(document.querySelector('.dsh-space-member-summary')).toBeNull()
  await click('查看信息')
  const panel = document.querySelector('.dsh-space-details')!
  expect(panel.querySelector('.dsh-space-detail-status')?.textContent).toBe('1 个会话 · 空间')
  expect(panel.textContent).toContain('成员目录')
  expect(panel.textContent).not.toContain('主要')
  expect(panel.querySelector('[aria-label="新建会话"]')).toBeNull()
  expect(panel.querySelector('[aria-label="关闭信息"]')).toBeNull()
  expect(panel.querySelectorAll('.dsh-space-detail-member code')[0]?.textContent).toBe('/b')
  expect(panel.querySelectorAll('.dsh-space-detail-member-text>span')).toHaveLength(1)
  expect(panel.querySelectorAll('.dsh-space-detail-member')).toHaveLength(2)
  await click('打开成员目录 /a')
  expect(workspaces.openPath).toHaveBeenCalledWith('/a')
  await act(async () => panel.querySelector<HTMLButtonElement>('.dsh-space-detail-edit')!.click())
  expect(document.querySelector('dialog')?.open).toBe(true)
})

it('会话悬浮预览只展示摘要，移入后仍可原位改名', async () => {
  vi.useFakeTimers()
  await mount()
  await act(async () => {
    const event = new Event('pointerover', { bubbles: true })
    Object.assign(event, { pointerType: 'mouse' })
    button('已有会话').dispatchEvent(event)
    await vi.advanceTimersByTimeAsync(500)
  })
  const panel = document.querySelector('.dsh-space-details.session')!
  expect(panel.querySelector('.dsh-space-details-actions')).toBeNull()
  expect(panel.querySelector('.dsh-space-detail-status')?.textContent).toBe('空闲')
  expect(panel.querySelector('time')).not.toBeNull()
  await act(async () => panel.querySelector<HTMLButtonElement>('.dsh-space-details-title')!.click())
  expect(document.querySelector('input[aria-label="名称"]')).not.toBeNull()
})

it('浮层路径按目录分段，保留中文、连字符和 Windows 分隔符', async () => {
  const { item } = await mount()
  const paths = [
    ['/private/tmp/dsh-space-smoke.abc/上线验收空间', ['/private/', 'tmp/', 'dsh-space-smoke.abc/', '上线验收空间']],
    ['C:\\开发\\source-a', ['C:\\', '开发\\', 'source-a']],
    ['\\\\server\\share\\source-b', ['\\\\server\\', 'share\\', 'source-b']],
    ['/', ['/']],
  ] as const
  await registry({ ...fixture.registry!, items: [{ ...item, primary: undefined, members: paths.map(([path]) => ({ path, mode: 'reference' })) }] })
  await click('查看信息')
  const codes = document.querySelectorAll('.dsh-space-detail-member code')
  paths.forEach(([path, parts], index) => {
    expect(codes[index]!.textContent).toBe(path)
    expect(Array.from(codes[index]!.querySelectorAll('span')).map(span => span.textContent)).toEqual(parts)
    expect(codes[index]!.getAttribute('dir')).toBe('ltr')
  })
})

describe('侧栏交互', () => {
  it('项目行只保留开合文件夹图标，折叠切换不改变类型或会话', async () => {
    const { workspaces, sessions } = await mount()
    const heading = document.querySelector<HTMLButtonElement>('.dsh-space-heading')!
    const icon = heading.querySelector('.dsh-space-workspace-icon')!
    const open = icon.innerHTML
    expect(icon.classList.contains('space')).toBe(true)
    expect(heading.getAttribute('aria-description')).toBe('空间项目')
    expect(heading.textContent).toBe('演示空间')
    expect(heading.querySelector('.dsh-space-count')).toBeNull()
    expect(heading.querySelectorAll('svg')).toHaveLength(1)
    expect(heading.getAttribute('aria-expanded')).toBe('true')
    await act(async () => heading.click())
    expect(heading.getAttribute('aria-expanded')).toBe('false')
    expect(icon.innerHTML).not.toBe(open)
    expect(document.querySelector('.dsh-space-session')).toBeNull()
    await act(async () => heading.click())
    expect(icon.innerHTML).toBe(open)
    expect(document.querySelector('.dsh-space-session-title')?.textContent).toBe('已有会话')
    expect(operation).not.toHaveBeenCalled()
    expect(workspaces.startSession).not.toHaveBeenCalled()
    expect(sessions.open).not.toHaveBeenCalled()
  })

  it.each(['composition', 'isComposing', '229'] as const)('输入法确认不隐式提交改名，独立 Enter 才保存：%s', async (kind) => {
    const { workspaces } = await mount()
    await click('查看信息')
    await click('演示空间')
    await input('名称', 'ceshi')
    const field = document.querySelector<HTMLInputElement>('input[aria-label="名称"]')!
    const form = field.closest('form')!
    await act(async () => {
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      if (kind !== 'composition')
        field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: kind === 'isComposing', keyCode: kind === '229' ? 229 : 13 })
      field.dispatchEvent(enter)
      // jsdom 不执行浏览器的隐式表单提交，按默认事件是否被取消重放
      if (!enter.defaultPrevented)
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(workspaces.rename).not.toHaveBeenCalled()
    expect(field.isConnected).toBe(true)
    await act(async () => {
      field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      field.dispatchEvent(enter)
      if (!enter.defaultPrevented)
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(workspaces.rename).toHaveBeenCalledExactlyOnceWith('w', 'ceshi')
  })

  it('输入法 Escape 只取消候选，不退出名称编辑', async () => {
    await mount()
    await click('查看信息')
    await click('演示空间')
    const field = document.querySelector<HTMLInputElement>('input[aria-label="名称"]')!
    await act(async () => {
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }))
    })
    expect(field.isConnected).toBe(true)
  })

  it('项目草稿高亮项目标题，不创建或选中虚构会话', async () => {
    const { draft, sessions } = await mount()
    await act(async () => draft.begin('w'))
    const heading = document.querySelector<HTMLButtonElement>('.dsh-space-heading')!
    expect(heading.getAttribute('aria-current')).toBe('location')
    expect(heading.closest('.dsh-space-head')?.classList.contains('current')).toBe(true)
    expect(document.querySelectorAll('.dsh-space-session')).toHaveLength(1)
    expect(document.querySelector('.dsh-space-session.current')).toBeNull()
    expect(sessions.open).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
  })

  it('改选草稿目标即时移动高亮，独立草稿和真实会话不高亮后台项目', async () => {
    const { draft, item, workspaceSnapshot, sessionSnapshot } = await mount()
    workspaceSnapshot.items.push({ ...item, kind: 'plain', workspaceId: 'other', title: '另一项目', path: '/other', sessionIds: [] })
    await registry({ ...fixture.registry! })
    const editor = document.createElement('textarea')
    document.body.append(editor)
    editor.focus()
    await act(async () => draft.begin('w'))
    await act(async () => draft.setTarget('other'))
    expect(document.querySelectorAll('.dsh-space-head.current')).toHaveLength(1)
    expect(document.querySelector('.dsh-space-heading[aria-current="location"]')?.textContent).toContain('另一项目')
    expect(document.activeElement).toBe(editor)
    await act(async () => draft.setTarget())
    expect(document.querySelector('.dsh-space-head.current')).toBeNull()
    await act(async () => draft.setTarget('w'))
    sessionSnapshot.current = 's'
    await act(async () => draft.suspend())
    expect(document.querySelector('.dsh-space-head.current')).toBeNull()
    expect(button('已有会话').getAttribute('aria-current')).toBe('page')
  })

  it.each([false, true])('草稿目标保留在长列表中，所属分区展开且仅有一个高亮（置顶：%s）', async (pinned) => {
    const { draft, item, workspaceSnapshot } = await mount()
    const layout = createLayoutStore()
    const projects = Array.from({ length: 7 }, (_, index): RegistryItem => ({
      kind: 'plain',
      workspaceId: `w${index}`,
      title: `项目${index}`,
      path: `/w${index}`,
      sessionIds: [],
    }))
    workspaceSnapshot.items = [item, ...projects]
    await registry({ ...fixture.registry! })
    await act(async () => {
      if (pinned)
        projects.forEach(project => layout.setPinned({ kind: 'workspace', id: project.workspaceId }, true))
      layout.setCollapsed(pinned ? 'pinned' : 'workspaces', true)
    })
    await act(async () => draft.begin('w6'))
    const heading = document.querySelector('.dsh-space-heading[aria-current="location"]')!
    expect(heading.textContent).toContain('项目6')
    expect(heading.closest('[data-section]')?.getAttribute('data-section')).toBe(pinned ? 'pinned' : 'workspaces')
    expect(document.querySelectorAll('.dsh-space-head.current')).toHaveLength(1)
    expect(workspaceSnapshot.items.map(item => item.workspaceId)).toEqual(['w', ...projects.map(project => project.workspaceId)])
    expect(operation).not.toHaveBeenCalled()
  })

  it('草稿项目可手动折叠，描述同步和重选同一目标不强制展开', async () => {
    const { draft } = await mount()
    await act(async () => draft.begin('w'))
    const heading = document.querySelector<HTMLButtonElement>('.dsh-space-heading')!
    await act(async () => heading.click())
    await registry({ ...fixture.registry! })
    await act(async () => draft.setTarget('w'))
    expect(heading.getAttribute('aria-expanded')).toBe('false')
    expect(heading.getAttribute('aria-current')).toBe('location')
    expect(document.querySelector('.dsh-space-session')).toBeNull()
  })

  it('分组视图和失效目标不补造项目，返回工作区视图恢复高亮', async () => {
    const { draft, workspaceSnapshot } = await mount()
    await act(async () => draft.begin('w'))
    await click('分组视图')
    expect(document.querySelector('.dsh-space-head')).toBeNull()
    expect(document.querySelectorAll('.dsh-space-session')).toHaveLength(1)
    await click('项目视图')
    expect(document.querySelector('.dsh-space-head.current')).not.toBeNull()
    workspaceSnapshot.items = []
    await registry({ ...fixture.registry! })
    expect(document.querySelector('.dsh-space-head')).toBeNull()
    expect(draft.getSnapshot().targetId).toBe('w')
  })

  it('独立对话和工作区新会话只开始草稿，不分配目录或会话', async () => {
    const { beginDraft, workspaces } = await mount()
    await click('新建独立对话')
    expect(beginDraft).toHaveBeenCalledWith()
    await click('在 演示空间 中新建会话')
    expect(beginDraft).toHaveBeenLastCalledWith('w')
    expect(operation).not.toHaveBeenCalled()
    expect(workspaces.startSession).not.toHaveBeenCalled()
  })

  it('分组原位草稿取消不创建记录，保存与分配只改变展示标记', async () => {
    const { workspaces, mode, item } = await mount()
    await click('分组视图')
    await click('新建分组')
    await input('分组名称', '迭代计划')
    expect(mode.getSnapshot().blocked).toBe(true)
    expect(button('项目视图').disabled).toBe(true)
    await click('取消编辑分组')
    expect(createLayoutStore().getSnapshot().groups).toEqual([])
    await click('新建分组')
    await input('分组名称', '迭代计划')
    await act(async () => document.querySelector<HTMLInputElement>('input[aria-label="蓝色"]')!.click())
    await click('保存分组')
    const group = createLayoutStore().getSnapshot().groups[0]!
    expect(group).toMatchObject({ title: '迭代计划', color: 'blue' })
    await click('设置展示分组')
    await act(async () => {
      const select = document.querySelector('select')!
      select.value = group.id
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click('保存')
    expect(document.querySelector(`[data-display-group="${group.id}"] [data-session-id="s"]`)).not.toBeNull()
    expect(workspaces.insertSessionBefore).not.toHaveBeenCalled()
    expect(item.sessionIds).toEqual(['s'])
    await click('移除分组')
    expect(document.querySelector('dialog')?.textContent).toContain('不会删除会话')
    await click('移除分组')
    expect(document.querySelector('[data-display-group=""] [data-session-id="s"]')).not.toBeNull()
    expect(workspaces.delete).not.toHaveBeenCalled()
  })

  it('展示分组改名检查跨页冲突，分组删除后仍可取消原草稿', async () => {
    const store = createLayoutStore()
    const group = { id: 'g', title: '计划', color: 'gray' as const, collapsed: false }
    store.saveGroup(group, true)
    store.setView('groups')
    const { mode } = await mount()
    await click('编辑分组')
    await input('分组名称', '本页草稿')
    await act(async () => {
      store.saveGroup({ ...group, title: '其他页面' })
      window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-space.sidebar.layout' }))
    })
    await click('保存分组')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('其他页面变更')
    await act(async () => {
      store.deleteGroup('g')
      store.setView('workspaces')
      window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-space.sidebar.layout' }))
    })
    expect(document.querySelector<HTMLInputElement>('[aria-label="分组名称"]')?.value).toBe('本页草稿')
    await click('取消编辑分组')
    expect(mode.getSnapshot().blocked).toBe(false)
    expect(button('项目视图').getAttribute('aria-checked')).toBe('true')
  })

  it('宿主收起侧栏时保留分组名称及颜色草稿', async () => {
    const { setWide } = await mount()
    await click('分组视图')
    await click('新建分组')
    await input('分组名称', '未保存的名称')
    await setWide(false)
    expect(document.querySelector<HTMLInputElement>('[aria-label="分组名称"]')?.value).toBe('未保存的名称')
    await click('保存分组')
    expect(createLayoutStore().getSnapshot().groups[0]?.title).toBe('未保存的名称')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('收起全部只折叠工作区，独立对话和独立置顶不受影响', async () => {
    const { workspaces, sessions, item } = await mount()
    const chat: RegistryItem = { kind: 'chat', workspaceId: 'c', path: '/c', title: '聊天', sessionIds: ['chat'] }
    const old = sessions.list.getSnapshot()
    const nextSessions = { ...old, ids: [...old.ids, 'chat'], byId: { ...old.byId, chat: { ...old.byId.s!, id: 'chat', displayTitle: '独立会话' } } }
    sessions.list.getSnapshot = () => nextSessions
    const previous = workspaces.list.getSnapshot()
    const nextWorkspaces = { ...previous, items: [item, chat] }
    workspaces.list.getSnapshot = () => nextWorkspaces
    await registry({ ...fixture.registry!, items: [item, chat] })
    await click('置顶 已有会话')
    await click('收起全部工作区')
    expect(document.querySelector('.dsh-space-heading')?.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-section="chats"] [data-session-id="chat"]')).not.toBeNull()
    expect(document.querySelector('[data-section="pinned"] [data-session-id="s"]')).not.toBeNull()
    await click('展开全部工作区')
    expect(document.querySelector('.dsh-space-heading')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('活动排序不允许拖动核心工作区或调用会话手动排序', async () => {
    const { workspaces } = await mount()
    await click('最近活动')
    expect(document.querySelector<HTMLButtonElement>('.dsh-space-heading')?.draggable).toBe(false)
    expect(document.querySelector('.dsh-space-session [role="menu"]')?.textContent).not.toContain('上移')
    await click('手动排序')
    expect(document.querySelector<HTMLButtonElement>('.dsh-space-heading')?.draggable).toBe(true)
    expect(workspaces.insertBefore).not.toHaveBeenCalled()
    expect(workspaces.insertSessionBefore).not.toHaveBeenCalled()
  })

  it('分组支持拖入会话，拖入未分组区域只清理标记', async () => {
    const store = createLayoutStore()
    store.saveGroup({ id: 'g', title: '计划', color: 'gray', collapsed: false }, true)
    store.setView('groups')
    const { workspaces } = await mount()
    const move = async (target: string): Promise<void> => act(async () => {
      document.querySelector('.dsh-space-session-main')!.dispatchEvent(new Event('dragstart', { bubbles: true }))
      document.querySelector(target)!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    })
    await move('[data-display-group="g"]')
    expect(createLayoutStore().getSnapshot().assignments.s).toBe('g')
    await move('[data-display-group=""]')
    expect(createLayoutStore().getSnapshot().assignments.s).toBeUndefined()
    expect(workspaces.insertSessionBefore).not.toHaveBeenCalled()
  })

  it('工作区浮层允许限时绕行，进入面板取消关闭，停在途中则关闭', async () => {
    vi.useFakeTimers()
    await mount()
    const pointer = (type: string, target: Element): void => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100 })
      Object.defineProperty(event, 'pointerType', { value: 'mouse' })
      target.dispatchEvent(event)
    }
    const heading = document.querySelector('.dsh-space-heading')!
    await act(async () => pointer('pointerover', heading))
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(100))
    const panel = document.querySelector('.dsh-space-details')!
    expect(panel).not.toBeNull()
    await act(async () => pointer('pointerout', heading))
    await act(async () => pointer('pointerover', document.querySelector('.dsh-space-session-main')!))
    await act(async () => pointer('pointermove', document.body))
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(document.querySelector('.dsh-space-details')).toBe(panel)
    await act(async () => pointer('pointerover', panel))
    await act(async () => vi.advanceTimersByTimeAsync(600))
    expect(document.querySelector('.dsh-space-details')).toBe(panel)
    await act(async () => pointer('pointerout', panel))
    expect(document.querySelector('.dsh-space-details')).toBe(panel)
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(document.querySelector('.dsh-space-details')).toBeNull()

    await act(async () => pointer('pointerover', heading))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(document.querySelector('.dsh-space-details')).not.toBeNull()
    await act(async () => pointer('pointerout', heading))
    await act(async () => pointer('pointerover', document.body))
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
  })

  it('直接悬停项目右侧控件也打开信息，短暂经过不打开', async () => {
    vi.useFakeTimers()
    await mount()
    const control = button('在 演示空间 中新建会话')!
    const pointer = (type: string): void => {
      const event = new MouseEvent(type, { bubbles: true })
      Object.assign(event, { pointerType: 'mouse' })
      control.dispatchEvent(event)
    }
    await act(async () => pointer('pointerover'))
    await act(async () => vi.advanceTimersByTimeAsync(100))
    await act(async () => pointer('pointerout'))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    await act(async () => pointer('pointerover'))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(document.querySelector('[aria-label="工作区信息"]')).not.toBeNull()
  })

  it('上一浮层超时关闭不取消下一行的悬停打开', async () => {
    vi.useFakeTimers()
    await mount()
    const pointer = (type: string, target: Element): void => {
      const event = new MouseEvent(type, { bubbles: true })
      Object.assign(event, { pointerType: 'mouse' })
      target.dispatchEvent(event)
    }
    const heading = document.querySelector('.dsh-space-heading')!
    await act(async () => pointer('pointerover', heading))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    await act(async () => pointer('pointerout', heading))
    await act(async () => pointer('pointerover', document.querySelector('.dsh-space-session-main')!))
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(document.querySelector('[aria-label="会话信息"]')).not.toBeNull()
  })

  it('改名时类型图标属于编辑区，点击其他操作则取消草稿且执行该操作', async () => {
    const { workspaces, mode } = await mount()
    await click('查看信息')
    await click('演示空间')
    await input('名称', '未提交')
    const editor = document.querySelector<HTMLInputElement>('[aria-label="名称"]')!
    await act(async () => {
      document.querySelector<HTMLElement>('.dsh-space-detail-type')!.click()
    })
    expect(document.querySelector('[aria-label="名称"]')).toBe(editor)
    expect(editor.value).toBe('未提交')
    expect(mode.getSnapshot().blocked).toBe(false)
    await act(async () => document.querySelector<HTMLButtonElement>('.dsh-space-detail-path')!.click())
    expect(workspaces.openPath).toHaveBeenCalledWith('/workspace')
    expect(workspaces.rename).not.toHaveBeenCalled()
    expect(document.querySelector('.dsh-space-details')).toBeNull()
  })

  it('改名时点击空白区关闭，离开面板超时关闭，不隐式保存', async () => {
    vi.useFakeTimers()
    const { workspaces } = await mount()
    for (const type of ['click', 'pointerout']) {
      await click('查看信息')
      await click('演示空间')
      await input('名称', '未提交')
      await act(async () => {
        const event = new MouseEvent(type, { bubbles: true })
        Object.defineProperty(event, 'pointerType', { value: 'mouse' })
        document.querySelector('.dsh-space-details-body')!.dispatchEvent(event)
      })
      if (type === 'pointerout')
        await act(async () => vi.advanceTimersByTimeAsync(250))
      expect(document.querySelector('.dsh-space-details')).toBeNull()
    }
    expect(workspaces.rename).not.toHaveBeenCalled()
  })

  it('关闭后的改名请求防重入，失败反馈在侧栏且不关闭新浮层', async () => {
    const { workspaces } = await mount()
    let reject!: (error: Error) => void
    vi.mocked(workspaces.rename).mockImplementationOnce(() => new Promise((_, fail) => {
      reject = fail
    }))
    await click('查看信息')
    await click('演示空间')
    await input('名称', '正在保存')
    await click('保存名称')
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    await click('查看信息')
    await click('演示空间')
    await input('名称', '第二次')
    await click('保存名称')
    expect(workspaces.rename).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.dsh-space-details [role="alert"]')?.textContent).toContain('正在保存')
    await act(async () => reject(new Error('后台保存失败')))
    expect(document.querySelector('.dsh-space-list')?.parentElement?.textContent).toContain('后台保存失败')
    expect(document.querySelector<HTMLInputElement>('[aria-label="名称"]')?.value).toBe('第二次')
  })

  it('触屏和独立对话不因指针进入弹出项目浮层', async () => {
    vi.useFakeTimers()
    const { item } = await mount()
    const touch = new MouseEvent('pointerover', { bubbles: true })
    Object.defineProperty(touch, 'pointerType', { value: 'touch' })
    await act(async () => document.querySelector('.dsh-space-heading')!.dispatchEvent(touch))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    await registry({ ...fixture.registry!, items: [{ ...item, kind: 'chat' }] })
    const mouse = new MouseEvent('pointerover', { bubbles: true })
    Object.defineProperty(mouse, 'pointerType', { value: 'mouse' })
    await act(async () => document.querySelector('.dsh-space-session-main')!.dispatchEvent(mouse))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
  })

  it('工作区改名失败保留草稿，不锁定模式或其他操作', async () => {
    const { mode, workspaces } = await mount()
    await click('查看信息')
    expect(document.querySelector('[aria-label="工作区信息"]')?.textContent).toContain('/workspace')
    await click('演示空间')
    await input('名称', '改名后的空间')
    expect(mode.getSnapshot().blocked).toBe(false)
    vi.mocked(workspaces.rename).mockRejectedValueOnce(new Error('离线'))
    await click('保存名称')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('离线')
    expect(document.querySelector<HTMLInputElement>('[aria-label="名称"]')?.value).toBe('改名后的空间')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(mode.getSnapshot().blocked).toBe(false)
    expect(document.querySelector('[aria-label="名称"]')).toBeNull()
    expect(workspaces.rename).toHaveBeenCalledWith('w', '改名后的空间')
  })

  it('会话改名通过官方 binding，重复保存只提交一次且不锁定其他操作', async () => {
    const { sessions, mode } = await mount()
    const rename = vi.fn()
    let finish!: (value: { ok: boolean }) => void
    rename.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    vi.mocked(sessions.binding).mockReturnValue({ session: { rename } })
    await act(async () => {
      const menu = document.querySelector('.dsh-space-session [role="menu"]')!
      Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '重命名')!.click()
    })
    expect(document.querySelector('[aria-label="会话信息"]')?.textContent).toContain('演示空间')
    await input('名称', '会话新名称')
    await act(async () => {
      button('保存名称').click()
      button('保存名称').click()
    })
    expect(rename).toHaveBeenCalledTimes(1)
    expect(button('保存名称').disabled).toBe(true)
    expect(button('查看已归档').disabled).toBe(false)
    expect(mode.getSnapshot().blocked).toBe(false)
    await act(async () => finish({ ok: true }))
    expect(mode.getSnapshot().blocked).toBe(false)
    expect(document.querySelector('[aria-label="名称"]')).toBeNull()
  })

  it('escape 取消未提交改名并关闭信息，恢复行焦点', async () => {
    const { workspaces, mode } = await mount()
    await click('查看信息')
    await click('演示空间')
    await input('名称', '未保存')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[aria-label="名称"]')).toBeNull()
    expect(mode.getSnapshot().blocked).toBe(false)
    expect(document.querySelector('[aria-label="工作区信息"]')).toBeNull()
    expect(document.activeElement?.className).toBe('dsh-space-heading')
    expect(workspaces.rename).not.toHaveBeenCalled()
  })

  it('独立对话原位改名不展示虚构的项目归属信息', async () => {
    const { item } = await mount()
    await registry({ ...fixture.registry!, items: [{ ...item, kind: 'chat' }] })
    await click('重命名')
    const info = document.querySelector('[aria-label="会话信息"]')!
    expect(info).not.toBeNull()
    expect(info.textContent).not.toContain('演示空间')
    expect(document.querySelector('[aria-label="名称"]')).not.toBeNull()
  })

  it('宿主收起侧栏时取消原位编辑，不留存脱离锚点的浮层', async () => {
    const { setWide, mode } = await mount()
    await click('查看信息')
    await click('演示空间')
    await input('名称', '保留草稿')
    await setWide(false)
    expect(document.querySelector('[aria-label="名称"]')).toBeNull()
    expect(mode.getSnapshot().blocked).toBe(false)
    expect(document.querySelector('.dsh-space-details')).toBeNull()
  })

  it('打开上下文菜单或跳转会话会关闭只读信息，不重叠两个弹层', async () => {
    await mount()
    await click('查看信息')
    await act(async () => document.querySelector('.dsh-space-head')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    expect(button('演示空间 工作区操作').getAttribute('aria-expanded')).toBe('true')
    await click('查看信息')
    await click('已有会话')
    expect(document.querySelector('.dsh-space-details')).toBeNull()
  })

  it('置顶工作区与单个会话只改变展示位置，取消后恢复归属', async () => {
    const { workspaces } = await mount()
    expect(document.querySelector('[data-section="pinned"]')).toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('.dsh-space-head [role="menuitem"]')!.click())
    expect(document.querySelector('[data-section="pinned"] .dsh-space-group')).not.toBeNull()
    expect(document.querySelector('[data-section="workspaces"] .dsh-space-group')).toBeNull()
    await click('置顶 已有会话')
    expect(document.querySelectorAll('[data-session-id="s"]')).toHaveLength(1)
    expect(document.querySelector('[data-section="pinned"] .dsh-space-group [data-session-id="s"]')).toBeNull()
    await click('取消置顶 已有会话')
    expect(document.querySelector('[data-section="pinned"] .dsh-space-group [data-session-id="s"]')).not.toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('.dsh-space-head [role="menuitem"]')!.click())
    expect(document.querySelector('[data-section="workspaces"] [data-session-id="s"]')).not.toBeNull()
    expect(document.querySelector('[data-section="pinned"]')).toBeNull()
    expect(workspaces.insertBefore).not.toHaveBeenCalled()
    expect(workspaces.insertSessionBefore).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
  })

  it('大分区可以独立折叠、排序，折叠后仍可创建', async () => {
    await mount()
    await click('项目')
    expect(document.querySelector('.dsh-space-group')).toBeNull()
    expect(button('添加工作区').disabled).toBe(false)
    await click('下移分区')
    expect(Array.from(document.querySelectorAll('[data-section]')).map(node => node.getAttribute('data-section'))).toEqual(['workspaces', 'chats'])
    await click('创建空间')
    expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe('创建空间')
  })

  it('失效置顶不撑起空分区，首个有效置顶显示，移除最后一项再次隐藏', async () => {
    const layout = createLayoutStore()
    layout.setPinned({ kind: 'session', id: 'missing' }, true)
    await mount()
    expect(document.querySelector('[data-section="pinned"]')).toBeNull()
    const order = layout.getSnapshot().sections
    await click('置顶 已有会话')
    expect(document.querySelector('[data-section="pinned"] [data-session-id="s"]')).not.toBeNull()
    await click('取消置顶 已有会话')
    expect(document.querySelector('[data-section="pinned"]')).toBeNull()
    expect(layout.getSnapshot().sections).toEqual(order)
  })

  it('独立对话平铺且目录可单独管理，描述不可用时退回核心分组', async () => {
    const { item } = await mount()
    await registry({ ...fixture.registry!, items: [{ ...item, kind: 'chat' }] })
    expect(document.querySelector('[data-section="chats"] [data-session-id="s"]')).not.toBeNull()
    expect(document.querySelector('[data-section="chats"] .dsh-space-group')).toBeNull()
    await click('管理对话目录')
    expect(document.querySelector('dialog')?.textContent).toContain('/workspace')
    await click('关闭')
    await registry(undefined)
    expect(document.querySelector('[data-section="workspaces"] [data-session-id="s"]')).not.toBeNull()
  })

  it('快捷归档失败保留置顶；成功调用官方接口后去除置顶', async () => {
    const { workspaces, workspaceSnapshot } = await mount()
    await click('置顶 已有会话')
    vi.mocked(workspaces.archiveSession).mockRejectedValueOnce(new Error('离线'))
    await click('归档 已有会话')
    expect(workspaces.archiveSession).not.toHaveBeenCalled()
    await click('确认归档 已有会话')
    expect(document.querySelector('[data-section="pinned"] [data-session-id="s"]')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('离线')
    vi.mocked(workspaces.archiveSession).mockImplementationOnce(async () => {
      workspaceSnapshot.archivedSessionIds.push('s')
    })
    await click('确认归档 已有会话')
    await registry({ ...fixture.registry! })
    expect(document.querySelector('[data-session-id="s"]')).toBeNull()
    expect(JSON.parse(localStorage.getItem('dsh-space.sidebar.layout')!).pins).toEqual([])
  })

  it('归档需要第二次确认，Escape、点击外部和切换视图都取消确认', async () => {
    const { workspaces } = await mount()
    await click('归档 已有会话')
    expect(document.activeElement).toBe(button('确认归档 已有会话'))
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('.confirming')).toBeNull()
    await click('归档 已有会话')
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(document.querySelector('.confirming')).toBeNull()
    await click('归档 已有会话')
    await click('分组视图')
    expect(document.querySelector('.confirming')).toBeNull()
    expect(workspaces.archiveSession).not.toHaveBeenCalled()
  })

  it('会话菜单同样经过原地确认，提交中不会重复归档', async () => {
    const { workspaces, mode } = await mount()
    let finish!: () => void
    vi.mocked(workspaces.archiveSession).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await click('归档会话')
    expect(workspaces.archiveSession).not.toHaveBeenCalled()
    await click('确认归档 已有会话')
    await click('确认归档 已有会话')
    expect(workspaces.archiveSession).toHaveBeenCalledTimes(1)
    expect(mode.getSnapshot().blocked).toBe(true)
    expect(button('查看已归档').disabled).toBe(true)
    await act(async () => finish())
    expect(mode.getSnapshot().blocked).toBe(false)
  })

  it('归档视图保留分组标记，禁用计划操作且不调用任何会话写接口', async () => {
    const store = createLayoutStore()
    store.saveGroup({ id: 'g', title: '计划', color: 'blue', collapsed: false }, true)
    store.assignGroup('s', 'g')
    const { workspaceSnapshot, workspaces, sessions } = await mount()
    workspaceSnapshot.archivedSessionIds.push('s')
    await registry({ ...fixture.registry! })
    await click('查看已归档')
    expect(document.querySelector('[data-archived-session-id="s"]')?.textContent).toContain('演示空间')
    expect(document.querySelector('.dsh-space-planned-notice')?.textContent).toContain('计划支持')
    expect(button('取消归档（计划支持）').disabled).toBe(true)
    expect(button('永久删除（计划支持）').disabled).toBe(true)
    await click('取消归档（计划支持）')
    await click('永久删除（计划支持）')
    expect(workspaces.archiveSession).not.toHaveBeenCalled()
    expect(workspaces.delete).not.toHaveBeenCalled()
    expect(sessions.open).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
    expect(createLayoutStore().getSnapshot().assignments.s).toBe('g')
    await click('搜索')
    await input('搜索归档会话', '不匹配')
    expect(document.querySelector('.dsh-space-archive')?.textContent).toContain('没有匹配')
  })

  it('搜索收起清空筛选，关闭归档恢复原视图和滚动位置且保留原排序', async () => {
    await mount()
    await click('分组视图')
    await click('搜索')
    await input('搜索项目或会话', '已有')
    await click('关闭搜索')
    const list = document.querySelector<HTMLDivElement>('.dsh-space-list')!
    await act(async () => {
      list.scrollTop = 120
      list.dispatchEvent(new Event('scroll'))
    })
    await click('查看已归档')
    await click('搜索')
    await input('搜索归档会话', '归档查询')
    await click('关闭搜索')
    await click('按标题')
    await click('关闭归档')
    expect(button('分组视图').getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector<HTMLInputElement>('[aria-label="搜索项目或会话"]')?.value).toBe('')
    expect(list.scrollTop).toBe(120)
    expect(createLayoutStore().getSnapshot().sessionSort).toBe('updated')
  })

  it('收起侧栏时归档入口仍可使用，摘要缺失明确提示且不清理记录', async () => {
    const { workspaceSnapshot } = await mount(false)
    workspaceSnapshot.archivedSessionIds.push('missing')
    await click('查看已归档')
    expect(document.querySelector('dialog')?.textContent).toContain('1 条归档记录暂缺会话摘要')
    expect(workspaceSnapshot.archivedSessionIds).toEqual(['missing'])
    await click('关闭')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('长列表折叠时保留当前会话，展开和收起不改核心顺序', async () => {
    const { sessionSnapshot, workspaceSnapshot, workspaces } = await mount()
    for (let index = 0; index < 7; index++) {
      const id = `extra-${index}`
      sessionSnapshot.ids.unshift(id)
      Object.assign(sessionSnapshot.byId, { [id]: { id, displayTitle: id, updatedAt: index, blank: false, running: false } })
      workspaceSnapshot.items[0]!.sessionIds.unshift(id)
    }
    await registry({ ...fixture.registry! })
    expect(document.querySelectorAll('.dsh-space-session')).toHaveLength(6)
    expect(button('已有会话').getAttribute('aria-current')).toBe('page')
    await click('展开显示 演示空间')
    expect(document.querySelectorAll('.dsh-space-session')).toHaveLength(8)
    await click('收起列表 演示空间')
    expect(document.querySelectorAll('.dsh-space-session')).toHaveLength(6)
    expect(workspaces.insertSessionBefore).not.toHaveBeenCalled()
  })

  it('成员修改是草稿，取消不写入且释放模式锁', async () => {
    const { mode } = await mount()
    await click('编辑工作区')
    expect(document.querySelector('dialog')?.open).toBe(true)
    expect(mode.getSnapshot().blocked).toBe(true)
    await act(async () => document.querySelector<HTMLInputElement>('[aria-label="将 b 设为主要"]')!.click())
    await click('移除成员 a')
    expect(operation).not.toHaveBeenCalled()
    await click('取消')
    expect(document.querySelector('dialog')).toBeNull()
    expect(mode.getSnapshot().blocked).toBe(false)
  })

  it.each(['名称', '主成员'] as const)('首次编辑%s 不使用弹窗显示前的成员坐标', async (change) => {
    await mount()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.closest('dialog')?.open || !this.matches('[data-member-path]'))
        return 0
      const rows = Array.from(this.parentElement!.children)
      return 200 + rows.indexOf(this) * 100
    })
    await click('编辑工作区')
    const animate = vi.fn()
    for (const row of document.querySelectorAll<HTMLElement>('[data-member-path]'))
      row.animate = animate
    if (change === '名称') {
      await input('/a 显示名称', '首次输入')
      expect(animate).not.toHaveBeenCalled()
      await input('/a 显示名称', '再次输入')
      expect(animate).not.toHaveBeenCalled()
    }
    else {
      await act(async () => document.querySelector<HTMLInputElement>('[aria-label="将 b 设为主要"]')!.click())
      expect(animate.mock.calls.map(([frames]) => frames[0].transform)).toEqual(['translateY(100px)', 'translateY(-100px)'])
      animate.mockClear()
      await input('/b 显示名称', '切换主要后的输入')
      expect(animate).not.toHaveBeenCalled()
    }
  })

  it('编辑工作区包含名称、只读工作目录和移除入口，输入法确认不保存表单', async () => {
    const { workspaces } = await mount()
    await click('编辑工作区')
    expect(document.querySelector('.dsh-space-workspace-path')?.textContent).toContain('/workspace')
    expect(document.querySelector('.dsh-space-workspace-path input')).toBeNull()
    expect(button('移除工作区').disabled).toBe(false)
    await input('工作区名称', 'ce shi')
    await act(async () => {
      const field = document.querySelector('[aria-label="工作区名称"]')!
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      expect(field.dispatchEvent(event)).toBe(false)
    })
    expect(workspaces.rename).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
    await click('取消')
  })

  it('普通工作区在完整编辑中显式增强，取消不改变类型', async () => {
    const { item, workspaces, workspaceSnapshot } = await mount()
    const plain = { ...item, kind: 'plain' as const, members: undefined, primary: undefined, revision: undefined }
    workspaceSnapshot.items = [plain]
    await registry({ ...fixture.registry!, items: [plain] })
    expect(document.querySelector('.dsh-space-workspace-icon.space')).toBeNull()
    expect(document.querySelector('.dsh-space-heading')?.getAttribute('aria-description')).toBeNull()
    await click('编辑工作区')
    expect(document.querySelector('.dsh-space-member-list')).toBeNull()
    await act(async () => document.querySelector<HTMLInputElement>('.dsh-space-enhance input')!.click())
    await input('成员目录路径', '/c')
    await click('添加路径')
    expect(operation).not.toHaveBeenCalled()
    await click('取消')
    expect(workspaces.rename).not.toHaveBeenCalled()
    await click('编辑工作区')
    expect(document.querySelector<HTMLInputElement>('.dsh-space-enhance input')?.checked).toBe(false)
  })

  it('工作区名称保存失败后保留已保存成员，重试只改名', async () => {
    const { workspaces } = await mount()
    await click('编辑工作区')
    await input('工作区名称', '修改名称')
    await input('成员目录路径', '/c')
    await click('添加路径')
    vi.mocked(workspaces.rename).mockRejectedValueOnce(new Error('离线'))
    await click('保存')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('已完成的修改已保留')
    expect(document.querySelector<HTMLInputElement>('[aria-label="工作区名称"]')?.value).toBe('修改名称')
    expect(operation).toHaveBeenCalledTimes(1)
    await click('保存')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(workspaces.rename).toHaveBeenCalledTimes(2)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('重命名时点击编辑工作区，取消临时名称并执行入口操作', async () => {
    const { workspaces } = await mount()
    await click('查看信息')
    await click('演示空间')
    await input('名称', '不提交')
    await act(async () => document.querySelector<HTMLButtonElement>('.dsh-space-detail-edit')!.click())
    expect(document.querySelector('.dsh-space-details')).toBeNull()
    expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe('编辑工作区')
    expect(document.querySelector<HTMLInputElement>('[aria-label="工作区名称"]')?.value).toBe('演示空间')
    expect(workspaces.rename).not.toHaveBeenCalled()
  })

  it('显式重新载入丢弃名称、成员和未添加的路径草稿', async () => {
    await mount()
    await click('编辑工作区')
    await input('工作区名称', '未保存名称')
    await input('成员目录路径', '/c')
    await click('添加路径')
    await input('成员目录路径', '/not-added')
    operation.mockRejectedValueOnce(new Error('拒绝保存'))
    await click('保存')
    await click('放弃未保存修改并重新载入')
    expect(document.querySelector<HTMLInputElement>('[aria-label="工作区名称"]')?.value).toBe('演示空间')
    expect(document.querySelector<HTMLInputElement>('[aria-label="成员目录路径"]')?.value).toBe('')
    expect(document.querySelectorAll('[data-member-path]')).toHaveLength(2)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('路径输入的原生组字 Enter 不添加成员或提交整个表单', async () => {
    await mount()
    await click('编辑工作区')
    await input('成员目录路径', '/c')
    await act(async () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
      document.querySelector('[aria-label="成员目录路径"]')!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
    expect(document.querySelectorAll('[data-member-path]')).toHaveLength(2)
    expect(operation).not.toHaveBeenCalled()
  })

  it('整份草稿一次保存，携带原版本，失败保留输入', async () => {
    await mount()
    await click('编辑工作区')
    await input('成员目录路径', '/c')
    await click('添加路径')
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
    await click('编辑工作区')
    await input('成员目录路径', '/c')
    await click('添加路径')
    let finish!: (value: Record<string, unknown>) => void
    operation.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
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
    const space = { ...fixture.registry!.items[0]!, members: [{ path: '/a', mode: 'reference' }, { path: '/b', mode: 'reference' }, { path: '/c', mode: 'reference' }], revision: 'v2' }
    fixture.registry = { ...fixture.registry!, items: [space as RegistryItem] }
    await act(async () => finish({ space }))
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('escape 关闭弹窗并将焦点还给入口', async () => {
    await mount()
    const trigger = button('演示空间 工作区操作')
    await click('演示空间 工作区操作')
    trigger.focus()
    await click('编辑工作区')
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
    await click('编辑工作区')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('工作区名称')
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
    await click('编辑工作区')
    await click('添加成员目录')
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
    const { workspaces, beginDraft } = await mount(false)
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
    expect(beginDraft).toHaveBeenCalledWith('new')
    expect(workspaces.startSession).not.toHaveBeenCalled()
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

  it('已创建的空白会话保留真实节点及操作入口', async () => {
    const { sessionSnapshot } = await mount()
    sessionSnapshot.byId.s.blank = true
    await registry({ ...fixture.registry! })
    expect(document.querySelector('.dsh-space-session-main')).not.toBeNull()
    expect(document.body.textContent).toContain('分叉会话')
  })

  it('全文命中并入核心会话元数据，展示匹配片段', async () => {
    vi.useFakeTimers()
    const { sessions } = await mount()
    vi.mocked(sessions.search).mockResolvedValueOnce({ ok: true, value: {
      items: [{ sessionId: 's', snippet: '正文中的命中片段' }],
      hasMore: false,
    } })
    await click('搜索')
    await input('搜索项目或会话', '正文')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(sessions.search).toHaveBeenCalledWith('正文', expect.any(AbortSignal))
    expect(document.querySelector('.dsh-space-list')?.textContent).toContain('正文中的命中片段')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('全文失败保留标题匹配，重试成功后移除错误状态', async () => {
    vi.useFakeTimers()
    const { sessions } = await mount()
    vi.mocked(sessions.search).mockResolvedValueOnce({ ok: false, error: { message: '索引未开启' } })
    await click('搜索')
    await input('搜索项目或会话', '已有会话')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(document.querySelector('.dsh-space-list')?.textContent).toContain('已有会话')
    expect(document.querySelector('[role="alert"]')?.getAttribute('title')).toBe('索引未开启')
    await click('重试搜索')
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(sessions.search).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
