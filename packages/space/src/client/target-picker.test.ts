// @vitest-environment jsdom
import type { HostWorkspacePickerProps } from './target-picker.ts'
import type { ReactLike, RegistryPayload, WorkspaceService } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostWorkspacePicker } from './target-picker.ts'

const fixture = vi.hoisted(() => ({ receive: undefined as ((value?: RegistryPayload, error?: string) => void) | undefined, subscriptions: 0 }))
vi.mock('./registry.ts', () => ({
  observeRegistry: (receive: (value?: RegistryPayload, error?: string) => void) => {
    fixture.receive = receive
    fixture.subscriptions++
    return () => {
      fixture.receive = undefined
    }
  },
}))
let cleanup: (() => Promise<void>) | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) { this.dataset.open = 'true' },
    hidePopover(this: HTMLElement) { delete this.dataset.open },
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const target = this.classList.contains('dsh-space-target-picker')
    return { x: 0, y: 0, left: 100, top: 100, bottom: target ? 360 : 130, right: target ? 400 : 260, width: target ? 300 : 160, height: target ? 260 : 30, toJSON: () => ({}) }
  })
  fixture.subscriptions = 0
})
afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount(options: { disabled?: boolean, independent?: boolean, noAnchor?: boolean, onCreate?: () => void } = {}) {
  const registry: RegistryPayload = {
    ok: true,
    root: '/managed',
    invalidSpaces: [],
    invalidChats: [],
    items: [
      { kind: 'space', workspaceId: 's', path: '/project', title: '项目空间', sessionIds: [] },
      { kind: 'plain', workspaceId: 'p', path: '/plain', title: '普通目录', sessionIds: [] },
      { kind: 'chat', workspaceId: 'c', path: '/chat', title: 'new-chat', sessionIds: [] },
    ],
  }
  const core = { phase: 'ready', items: registry.items }
  const workspace = { list: { getSnapshot: () => core, subscribe: () => () => {} } } as unknown as WorkspaceService
  const Picker = createHostWorkspacePicker(React as unknown as ReactLike, workspace) as React.ComponentType<HostWorkspacePickerProps>
  const onPick = vi.fn()
  const onIndependent = vi.fn()
  const onClose = vi.fn()
  const anchor = document.createElement('button')
  anchor.textContent = '工作区入口'
  document.body.append(anchor)
  anchor.focus()
  const anchorRef = { current: anchor }
  function App() {
    const [open, setOpen] = React.useState(true)
    return createElement(Picker, {
      open,
      anchorRef: options.noAnchor ? undefined : anchorRef,
      independent: options.independent ?? true,
      selectedId: 's',
      disabled: options.disabled,
      onPick,
      onIndependent,
      onCreate: options.onCreate,
      onClose: () => {
        onClose()
        setOpen(false)
      },
    })
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => root.render(createElement(App)))
  cleanup = async () => {
    await act(async () => root.unmount())
  }
  return { registry, anchor, anchorRef, onPick, onIndependent, onClose, receive: async () => act(async () => fixture.receive?.(registry)) }
}

function panel(): HTMLDivElement | null {
  return document.querySelector('.dsh-space-target-picker')
}
function button(text: string): HTMLButtonElement {
  return [...panel()!.querySelectorAll<HTMLButtonElement>('button')].find(node => node.getAttribute('aria-label') === text || node.textContent?.startsWith(text))!
}
async function click(text: string): Promise<void> {
  await act(async () => button(text).click())
}
async function query(value: string): Promise<void> {
  const element = panel()!.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function key(key: string, fields: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...fields })
  await act(async () => document.activeElement!.dispatchEvent(event))
  return event
}

describe('紧凑工作区选择浮层', () => {
  it('依宿主触发器定位，只列目录和空间，选择后关闭并恢复焦点', async () => {
    const h = await mount()
    await h.receive()
    expect(document.querySelector('dialog')).toBeNull()
    expect(panel()?.getAttribute('popover')).toBe('manual')
    expect(panel()?.hasAttribute('aria-modal')).toBe(false)
    expect(panel()?.style.left).toBe('100px')
    expect(panel()?.style.top).toBe('136px')
    expect(panel()?.textContent).not.toContain('new-chat')
    expect(button('项目空间').getAttribute('aria-pressed')).toBe('true')
    expect(button('普通目录').querySelector('small')?.title).toBe('/plain')
    await click('普通目录')
    expect(h.onPick).toHaveBeenCalledWith('p')
    expect(h.onClose).toHaveBeenCalledOnce()
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(h.anchor)
    expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
  })

  it('底部独立对话只改变草稿意图，不选择任何伪工作区', async () => {
    const h = await mount()
    await h.receive()
    expect(button('独立对话').closest('.dsh-space-target-footer')).not.toBeNull()
    await click('独立对话')
    expect(h.onIndependent).toHaveBeenCalledOnce()
    expect(h.onPick).not.toHaveBeenCalled()
    expect(panel()).toBeNull()
  })

  it('创建后目标锁定，候选、独立对话和创建均不可点击', async () => {
    const h = await mount({ disabled: true })
    await h.receive()
    const buttons = [...panel()!.querySelectorAll<HTMLButtonElement>('.dsh-space-target-list button,.dsh-space-target-footer button')]
    expect(buttons.every(button => button.disabled)).toBe(true)
    await act(async () => buttons.forEach(button => button.click()))
    await key('Enter')
    expect(h.onPick).not.toHaveBeenCalled()
    expect(h.onIndependent).not.toHaveBeenCalled()
    expect(h.onClose).not.toHaveBeenCalled()
    await key('Escape')
    expect(h.onClose).toHaveBeenCalledOnce()
  })

  it('加载与失败保持安全候选，重试重新读取并保留选中项', async () => {
    const h = await mount()
    expect(panel()?.textContent).toContain('正在读取工作区')
    await act(async () => fixture.receive?.(undefined, 'offline'))
    expect(panel()?.querySelector('[role=alert]')?.textContent).toContain('读取失败')
    await click('重试读取工作区')
    expect(fixture.subscriptions).toBe(2)
    await h.receive()
    expect(panel()?.querySelector('[aria-pressed=true]')?.textContent).toContain('项目空间')
    expect(h.onPick).not.toHaveBeenCalled()
  })

  it('搜索匹配名称和路径，无结果可清除，输入法确认不会误选', async () => {
    const h = await mount()
    await h.receive()
    await query('/PLAIN')
    expect(panel()?.querySelectorAll('.dsh-space-target-list>button')).toHaveLength(1)
    await key('Enter', { isComposing: true })
    expect(h.onPick).not.toHaveBeenCalled()
    await query('missing')
    expect(panel()?.textContent).toContain('没有匹配的工作区')
    await click('清除工作区搜索')
    expect(panel()?.querySelectorAll('.dsh-space-target-list>button')).toHaveLength(2)
    await query('普通')
    await key('Enter')
    expect(h.onPick).toHaveBeenCalledWith('p')
  })

  it('箭头和首尾键导航；Tab 循环、拒绝背景焦点，Escape 回到触发器', async () => {
    const h = await mount()
    await h.receive()
    const search = panel()!.querySelector('input')!
    expect(document.activeElement).toBe(search)
    await key('ArrowDown')
    expect(document.activeElement).toBe(button('项目空间'))
    await key('End')
    expect(document.activeElement).toBe(button('新建工作区'))
    expect((await key('Tab')).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(search)
    expect((await key('Tab', { shiftKey: true })).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(button('新建工作区'))
    await key('Home')
    expect(document.activeElement).toBe(button('项目空间'))
    h.anchor.focus()
    expect(panel()!.contains(document.activeElement)).toBe(true)
    await key('Escape')
    expect(document.activeElement).toBe(h.anchor)
    expect(panel()).toBeNull()
  })

  it('背景点击只关闭浮层，不触发背景操作', async () => {
    const h = await mount()
    const clickOutside = vi.fn()
    document.body.addEventListener('click', clickOutside)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => document.querySelector('.dsh-space-menu-backdrop')!.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(clickOutside).not.toHaveBeenCalled()
    expect(h.onClose).toHaveBeenCalledOnce()
    document.body.removeEventListener('click', clickOutside)
  })

  it('背景右键可以交接侧栏菜单，不吞掉目标菜单或抢回焦点', async () => {
    const h = await mount()
    const sidebar = document.createElement('div')
    sidebar.className = 'dsh-space-root'
    const target = sidebar.appendChild(document.createElement('button'))
    document.body.append(sidebar)
    const context = vi.fn((event: Event) => {
      event.preventDefault()
      target.focus()
    })
    target.addEventListener('contextmenu', context)
    Object.assign(document, { elementFromPoint: () => target })
    await act(async () => document.querySelector('.dsh-space-menu-backdrop')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 25, clientY: 50 })))
    expect(context).toHaveBeenCalledOnce()
    expect(h.onClose).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(target)
  })

  it('新建入口先关闭浮层，再派发统一创建事件；真实会话不提供独立对话', async () => {
    const h = await mount({ independent: false })
    await h.receive()
    const create = vi.fn(() => {
      expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
      expect(h.onClose).toHaveBeenCalledOnce()
    })
    window.addEventListener('dsh-space-create-workspace', create)
    expect(panel()?.textContent).not.toContain('独立对话')
    await click('新建工作区')
    expect(create).toHaveBeenCalledOnce()
    expect(h.onPick).not.toHaveBeenCalled()
    window.removeEventListener('dsh-space-create-workspace', create)
  })

  it('上层可以接管创建；无 anchorRef 时使用打开前焦点元素定位并恢复', async () => {
    const create = vi.fn()
    const h = await mount({ noAnchor: true, onCreate: create })
    await h.receive()
    expect(panel()?.style.left).toBe('100px')
    await click('新建工作区')
    expect(create).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(h.anchor)
  })

  it('加载或读取失败时不派发新建请求，避免关闭浮层后没有可用创建上下文', async () => {
    const create = vi.fn()
    const h = await mount({ onCreate: create })
    expect(button('新建工作区').disabled).toBe(true)
    await click('新建工作区')
    await act(async () => fixture.receive?.(undefined, 'offline'))
    expect(button('新建工作区').disabled).toBe(true)
    await click('新建工作区')
    expect(create).not.toHaveBeenCalled()
    expect(h.onClose).not.toHaveBeenCalled()
    await h.receive()
    await click('新建工作区')
    expect(create).toHaveBeenCalledOnce()
  })

  it('布局变化导致焦点暂时落在 body 时，Escape 仍能关闭浮层', async () => {
    const h = await mount()
    panel()!.querySelector('input')!.blur()
    expect(document.activeElement).toBe(document.body)
    await key('Escape')
    expect(h.onClose).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(h.anchor)
  })

  it('宿主重建触发器后依最新 ref 重定位，关闭时恢复到新入口', async () => {
    const h = await mount()
    const replacement = document.createElement('button')
    document.body.append(replacement)
    h.anchor.remove()
    h.anchorRef.current = replacement
    vi.spyOn(replacement, 'getBoundingClientRect').mockReturnValue({ left: 220, top: 160, bottom: 190, right: 320, width: 100, height: 30, x: 220, y: 160, toJSON: () => ({}) })
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(panel()?.style.left).toBe('220px')
    expect(panel()?.style.top).toBe('196px')
    await key('Escape')
    expect(document.activeElement).toBe(replacement)
  })

  it('靠近视口底部向上展开，右侧边界不溢出，卸载清理焦点和拦截层', async () => {
    const h = await mount()
    vi.spyOn(h.anchor, 'getBoundingClientRect').mockReturnValue({ left: 970, top: 700, bottom: 730, right: 1130, width: 160, height: 30, x: 970, y: 700, toJSON: () => ({}) })
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(panel()?.style.left).toBe(`${innerWidth - 308}px`)
    expect(panel()?.style.top).toBe('434px')
    await cleanup!()
    cleanup = undefined
    expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
    expect(document.activeElement).toBe(h.anchor)
  })
})
