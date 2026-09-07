// @vitest-environment jsdom
import type { ReactLike } from './types.ts'
import * as React from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftMenu } from './draft-menu.ts'

let cleanup: () => Promise<void>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) { this.dataset.open = 'true' },
    hidePopover(this: HTMLElement) { delete this.dataset.open },
  })
})
afterEach(async () => {
  await cleanup?.()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mount() {
  const onAddImages = vi.fn()
  const onSubmit = vi.fn()
  const Menu = createDraftMenu(React as unknown as ReactLike) as React.ComponentType<any>
  function View() {
    const [open, setOpen] = React.useState(false)
    return createElement('form', { onSubmit }, createElement('textarea', { defaultValue: '保留草稿' }), createElement('button', { 'type': 'button', 'aria-expanded': open, 'onClick': () => setOpen(!open) }, '命令'), createElement('div', null, createElement(Menu, { open, onClose: () => setOpen(false), onAddImages })), createElement('button', { 'type': 'button', 'data-outside': true }, '外部操作'))
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => root.render(createElement(View)))
  cleanup = async () => {
    await act(async () => root.unmount())
  }
  const trigger = document.querySelector<HTMLButtonElement>('[aria-expanded]')!
  const panel = document.querySelector<HTMLDivElement>('[role=listbox]')!
  const items = [...panel.querySelectorAll<HTMLButtonElement>('[role=option]')]
  const open = async () => {
    trigger.focus()
    await act(async () => trigger.click())
  }
  const press = async (key: string, init?: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    await act(async () => document.activeElement!.dispatchEvent(event))
    return event
  }
  return { trigger, panel, items, open, press, onAddImages, onSubmit }
}

describe('草稿命令菜单', () => {
  it('打开菜单不直接选图，只有选择图片项才唤起选择器并恢复焦点', async () => {
    const h = await mount()
    await h.open()
    expect(h.trigger.getAttribute('aria-expanded')).toBe('true')
    expect(h.panel.dataset.open).toBe('true')
    expect(h.onAddImages).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(h.items[0])
    await h.press('Enter')
    expect(h.onAddImages).toHaveBeenCalledTimes(1)
    expect(h.onSubmit).not.toHaveBeenCalled()
    expect(h.trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(h.trigger)
    expect(document.querySelector('textarea')?.value).toBe('保留草稿')
  })

  it('会话命令可由键盘查看原因，但鼠标、Enter 和空格都不能执行', async () => {
    const h = await mount()
    await h.open()
    await h.press('ArrowDown')
    expect(document.activeElement).toBe(h.items[1])
    expect(h.items[1]?.getAttribute('aria-disabled')).toBe('true')
    expect(h.items[1]?.textContent).toContain('首次发送并创建会话后可用')
    await h.press('Enter')
    await h.press(' ')
    await act(async () => h.items[1]!.click())
    expect(h.onAddImages).not.toHaveBeenCalled()
    expect(h.onSubmit).not.toHaveBeenCalled()
    expect(h.panel.dataset.open).toBe('true')
  })

  it('方向键循环定位，Home 和 End 定位首尾，Escape 关闭并恢复焦点', async () => {
    const h = await mount()
    await h.open()
    await h.press('ArrowUp')
    expect(document.activeElement).toBe(h.items[1])
    await h.press('ArrowDown')
    expect(document.activeElement).toBe(h.items[0])
    await h.press('End')
    expect(document.activeElement).toBe(h.items[1])
    await h.press('Home')
    expect(document.activeElement).toBe(h.items[0])
    expect((await h.press('Escape')).defaultPrevented).toBe(true)
    expect(h.panel.dataset.open).toBeUndefined()
    expect(document.activeElement).toBe(h.trigger)
  })

  it('tab 关闭菜单但保留浏览器的正常焦点移动', async () => {
    const h = await mount()
    await h.open()
    expect((await h.press('Tab')).defaultPrevented).toBe(false)
    expect(h.panel.dataset.open).toBeUndefined()
    expect(document.activeElement).toBe(h.trigger)
  })

  it('点击外部关闭菜单，不抢回外部操作的焦点', async () => {
    const h = await mount()
    await h.open()
    const outside = document.querySelector<HTMLButtonElement>('[data-outside]')!
    outside.focus()
    await act(async () => {
      h.panel.hidePopover()
      h.panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }))
    })
    expect(h.trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(outside)
  })

  it('输入法确认不触发图片选择或发送', async () => {
    const h = await mount()
    await h.open()
    expect((await h.press('Enter', { isComposing: true })).defaultPrevented).toBe(true)
    expect((await h.press('Enter', { keyCode: 229 })).defaultPrevented).toBe(true)
    expect(h.onAddImages).not.toHaveBeenCalled()
    expect(h.onSubmit).not.toHaveBeenCalled()
  })

  it('菜单定位限制在视口内，缩放时关闭并恢复焦点', async () => {
    const h = await mount()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(568)
    vi.spyOn(h.panel, 'getBoundingClientRect').mockReturnValue({ width: 272, height: 106 } as DOMRect)
    vi.spyOn(h.panel.parentElement!, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 540, bottom: 560 } as DOMRect)
    await h.open()
    expect(h.panel.style.left).toBe('40px')
    expect(h.panel.style.top).toBe('426px')
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(h.panel.dataset.open).toBeUndefined()
    expect(document.activeElement).toBe(h.trigger)
  })
})
