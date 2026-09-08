// @vitest-environment jsdom
import type { ReactLike } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createControls } from './controls.ts'

let cleanup: (() => void) | undefined

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) { this.dataset.open = 'true' },
    hidePopover(this: HTMLElement) { delete this.dataset.open },
  })
})

afterEach(async () => {
  await act(async () => cleanup?.())
  cleanup = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function button(label: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
}

async function mount(): Promise<{ action: ReturnType<typeof vi.fn>, background: ReturnType<typeof vi.fn> }> {
  const { Menu } = createControls(React as unknown as ReactLike)
  const action = vi.fn()
  const background = vi.fn()
  const host = document.createElement('div')
  host.className = 'dsh-space-root'
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => root.unmount()
  await act(async () => root.render(createElement('div', null, ...['项目甲', '项目乙'].map(label => createElement('div', { 'key': label, 'data-row': label }, createElement('button', { 'aria-label': `${label} 打开`, 'onClick': background }, label), createElement(Menu as React.ComponentType<Parameters<typeof Menu>[0]>, {
    label,
    actions: [{ label: `${label} 编辑`, icon: 'edit', run: action }],
  }))))))
  return { action, background }
}

async function rightClick(target: Element, x = 70, y = 90): Promise<void> {
  await act(async () => {
    for (const type of ['pointerdown', 'mousedown', 'contextmenu', 'pointerup', 'mouseup']) {
      target.dispatchEvent(new MouseEvent(type, { button: 2, buttons: type.endsWith('up') ? 0 : 2, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    }
  })
}

describe('上下文菜单', () => {
  it('右击更多图标打开菜单并定位到指针，不触发业务动作', async () => {
    const { action, background } = await mount()
    await rightClick(button('项目甲').querySelector('svg')!)
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('true')
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="项目甲"]')!
    expect(menu.getAttribute('popover')).toBe('manual')
    expect(menu.style.left).toBe('70px')
    expect(menu.style.top).toBe('90px')
    expect(document.querySelectorAll('.dsh-space-menu-backdrop')).toHaveLength(1)
    expect(action).not.toHaveBeenCalled()
    expect(background).not.toHaveBeenCalled()
  })

  it('菜单内右击保持打开，不改成普通按钮点击的开关行为', async () => {
    const { action } = await mount()
    await act(async () => button('项目甲').click())
    const item = document.querySelector('[role="menuitem"]')!
    await rightClick(item)
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('.dsh-space-menu-backdrop')).toHaveLength(1)
    expect(action).not.toHaveBeenCalled()
  })

  it('遮罩上的第二次右击切换到实际目标菜单，不执行背景操作', async () => {
    const { action, background } = await mount()
    await act(async () => button('项目甲').click())
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => button('项目乙').querySelector('svg')) })
    await rightClick(document.querySelector('.dsh-space-menu-backdrop')!, 130, 150)
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('false')
    expect(button('项目乙').getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('.dsh-space-menu-backdrop')).toHaveLength(1)
    expect(action).not.toHaveBeenCalled()
    expect(background).not.toHaveBeenCalled()
  })

  it('重复右击同一入口保持菜单，并按新的指针位置重新定位', async () => {
    await mount()
    await rightClick(button('项目甲'))
    await rightClick(button('项目甲'), 110, 160)
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector<HTMLElement>('[role="menu"][aria-label="项目甲"]')!.style.top).toBe('160px')
    expect(document.querySelectorAll('.dsh-space-menu-backdrop')).toHaveLength(1)
  })

  it('上下文菜单接近视口边界时收回，无坐标键盘菜单沿用入口位置', async () => {
    await mount()
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="项目甲"]')!
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({ width: 180, height: 200 } as DOMRect)
    vi.spyOn(button('项目甲'), 'getBoundingClientRect').mockReturnValue({ left: 36, bottom: 80 } as DOMRect)
    await rightClick(button('项目甲'), window.innerWidth - 1, window.innerHeight - 1)
    expect(menu.style.left).toBe(`${window.innerWidth - 188}px`)
    expect(menu.style.top).toBe(`${window.innerHeight - 208}px`)
    await rightClick(button('项目甲'), 0, 0)
    expect(menu.style.left).toBe('36px')
    expect(menu.style.top).toBe('84px')
  })

  it('左击遮罩只关闭当前菜单，不将事件交给下方行', async () => {
    const { action, background } = await mount()
    await rightClick(button('项目甲'))
    const elementFromPoint = vi.fn(() => button('项目乙'))
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })
    await act(async () => document.querySelector<HTMLElement>('.dsh-space-menu-backdrop')!.click())
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('false')
    expect(button('项目乙').getAttribute('aria-expanded')).toBe('false')
    expect(elementFromPoint).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
    expect(background).not.toHaveBeenCalled()
  })

  it('右击插件外部只关闭菜单，不转发到宿主操作', async () => {
    await mount()
    const hostButton = document.createElement('button')
    document.body.append(hostButton)
    const context = vi.fn()
    hostButton.addEventListener('contextmenu', context)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => hostButton) })
    await rightClick(button('项目甲'))
    await rightClick(document.querySelector('.dsh-space-menu-backdrop')!)
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
    expect(context).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button('项目甲'))
  })

  it('打开另一入口时关闭旧菜单和遮罩，不依赖浏览器的 auto 互斥', async () => {
    await mount()
    await rightClick(button('项目甲'))
    await rightClick(button('项目乙'))
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('false')
    expect(button('项目乙').getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[role="menu"][data-open]')).toHaveLength(1)
    expect(document.querySelectorAll('.dsh-space-menu-backdrop')).toHaveLength(1)
  })

  it('原生关闭事件同步入口状态并释放遮罩', async () => {
    await mount()
    await rightClick(button('项目甲'))
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="项目甲"]')!
    await act(async () => {
      menu.hidePopover()
      const event = new Event('toggle')
      Object.assign(event, { newState: 'closed' })
      menu.dispatchEvent(event)
    })
    expect(button('项目甲').getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
  })

  it('escape 只关闭当前菜单，不继续触发父模态关闭', async () => {
    await mount()
    await rightClick(button('项目甲'))
    const parent = vi.fn()
    document.addEventListener('keydown', parent)
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      await act(async () => document.activeElement!.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
      expect(parent).not.toHaveBeenCalled()
      expect(document.querySelector('.dsh-space-menu-backdrop')).toBeNull()
      expect(document.activeElement).toBe(button('项目甲'))
    }
    finally {
      document.removeEventListener('keydown', parent)
    }
  })
})
