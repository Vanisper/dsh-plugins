// @vitest-environment jsdom
import type { ModeStore } from './mode.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createModeStore, installSidebarMode } from './mode.ts'
import { createNativePicker } from './native-picker.ts'

let dispose: () => void
let mode: ModeStore
let opener: HTMLButtonElement

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList
  })
  opener = document.createElement('button')
  opener.textContent = '打开弹窗'
  document.body.append(opener)
  opener.focus()
  mode = createModeStore()
  dispose = installSidebarMode({ inject: (_, factory) => factory(), register: () => () => {} }, mode, () => null, '')
})

afterEach(() => {
  dispose()
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
})

async function openModal(native = false): Promise<HTMLElement> {
  const root = document.createElement('div')
  root.setAttribute('role', 'presentation')
  // 宿主 Modal 使用 body portal、遮罩和 aria-modal div，并不调用 showModal
  root.innerHTML = native
    ? '<dialog class="dsh-space-dialog" open><button>关闭</button><input autofocus><button disabled>确认</button><button>取消</button></dialog>'
    : '<div aria-hidden="true" data-mask></div><div role="dialog" aria-modal="true"><button>关闭</button><input autofocus><button disabled>确认</button><button>取消</button></div>'
  document.body.append(root)
  const modal = root.lastElementChild as HTMLElement
  modal.querySelector('input')!.focus()
  await Promise.resolve()
  return modal
}

function tab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  document.activeElement!.dispatchEvent(event)
  return event
}

describe('空间模式的模态焦点边界', () => {
  it.each([false, true])('宿主和原生弹窗在两端循环，并拒绝背景焦点（native=%s）', async (native) => {
    const modal = await openModal(native)
    const first = modal.querySelector('button')!
    const last = modal.querySelector('button:last-child') as HTMLButtonElement
    expect(document.activeElement).toBe(modal.querySelector('input'))
    last.focus()
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    expect(tab(true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    opener.focus()
    expect(modal.contains(document.activeElement)).toBe(true)
  })

  it('嵌套弹窗只保留最上层焦点，逐层关闭后回到各自入口', async () => {
    const parent = await openModal()
    const nestedOpener = parent.querySelector('button:last-child') as HTMLButtonElement
    nestedOpener.focus()
    const child = await openModal()
    parent.querySelector('input')!.focus()
    expect(child.contains(document.activeElement)).toBe(true)
    child.parentElement!.remove()
    await Promise.resolve()
    expect(document.activeElement).toBe(nestedOpener)
    parent.parentElement!.remove()
    await Promise.resolve()
    expect(document.activeElement).toBe(opener)
  })

  it('忙碌时没有可用控件仍留在弹窗，解除禁用后重新使用真实 Tab 顺序', async () => {
    const modal = await openModal()
    modal.querySelectorAll('button,input').forEach(node => node.setAttribute('disabled', ''))
    tab()
    expect(document.activeElement).toBe(modal)
    const cancel = modal.querySelector('button:last-child') as HTMLButtonElement
    cancel.disabled = false
    tab()
    expect(document.activeElement).toBe(cancel)
  })

  it('原生选择器等待时暂停网页焦点回拉，取消后恢复模态边界', async () => {
    const modal = await openModal()
    let finish!: (value: null) => void
    const picker = createNativePicker(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = picker.pick(vi.fn())
    try {
      opener.focus()
      expect(document.activeElement).toBe(opener)
      expect(tab().defaultPrevented).toBe(true)
      finish(null)
      await pending
      opener.focus()
      expect(modal.contains(document.activeElement)).toBe(true)
    }
    finally {
      picker.dispose()
    }
  })

  it('整棵嵌套弹窗卸载时恢复最外层入口和每层原有属性', async () => {
    const parent = await openModal()
    const child = await openModal()
    parent.parentElement!.remove()
    child.parentElement!.remove()
    await Promise.resolve()
    expect(document.activeElement).toBe(opener)
    expect(parent.hasAttribute('tabindex')).toBe(false)
    expect(child.hasAttribute('tabindex')).toBe(false)
  })

  it('排除隐藏、禁用和折叠详情中的控件，并保留遮罩关闭行为', async () => {
    const modal = await openModal()
    modal.insertAdjacentHTML('beforeend', '<button hidden>隐藏</button><details><summary>展开</summary><input></details><button disabled>禁用</button>')
    const summary = modal.querySelector('summary')!
    summary.focus()
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(modal.querySelector('button'))
    const mask = modal.parentElement!.querySelector('[data-mask]')!
    const close = vi.fn()
    mask.addEventListener('click', close)
    mask.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('非模态信息浮层和菜单不接管焦点', async () => {
    const panel = document.createElement('div')
    panel.innerHTML = '<div role="dialog"><button>编辑</button></div><div role="menu"><button>排序</button></div>'
    document.body.append(panel)
    await Promise.resolve()
    panel.querySelector('button')!.focus()
    expect(tab().defaultPrevented).toBe(false)
    opener.focus()
    expect(document.activeElement).toBe(opener)
  })

  it('切回官方模式和卸载恢复 DOM 属性、移除观察器和键盘拦截', async () => {
    const modal = await openModal()
    mode.setMode('official')
    expect(modal.hasAttribute('tabindex')).toBe(false)
    opener.focus()
    expect(document.activeElement).toBe(opener)
    expect(tab().defaultPrevented).toBe(false)
    mode.setMode('space')
    expect(modal.contains(document.activeElement)).toBe(true)
    dispose()
    opener.focus()
    expect(document.activeElement).toBe(opener)
    expect(modal.hasAttribute('tabindex')).toBe(false)
  })
})
