// @vitest-environment jsdom
import type { ReactLike, SlotsService } from './types.ts'
import * as React from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModeControl, createModeStore, installSidebarMode } from './mode.ts'

afterEach(() => {
  localStorage.clear()
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

describe('工作区模式生命周期', () => {
  it('紧凑分段控件同步选中态与禁用态，窄栏只展示另一模式入口', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const mode = createModeStore()
    const Control = createModeControl(React as unknown as ReactLike, mode) as React.ComponentType<{ wide: boolean }>
    try {
      await act(async () => root.render(createElement(Control, { wide: true })))
      const buttons = [...host.querySelectorAll('button')]
      expect(buttons.map(button => button.textContent)).toEqual(['官方', '空间'])
      expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true')
      await act(async () => buttons[0]!.click())
      expect(mode.getSnapshot().mode).toBe('official')
      expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
      await act(async () => mode.setBlocked(true))
      expect(buttons.every(button => button.disabled)).toBe(true)
      await act(async () => buttons[1]!.click())
      expect(mode.getSnapshot().mode).toBe('official')
      await act(async () => {
        mode.setBlocked(false)
        root.render(createElement(Control, { wide: false }))
      })
      expect(host.querySelectorAll('button')).toHaveLength(1)
      expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('切换到空间模式')
      expect(host.querySelector('button')?.textContent).toBe('')
      await act(async () => host.querySelector('button')?.click())
      expect(mode.getSnapshot().mode).toBe('space')
    }
    finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('侧栏与会话草稿分别释放占用，不相互解锁', () => {
    const mode = createModeStore()
    mode.setBlocked(true)
    mode.setBlocked(true, 'draft')
    mode.setMode('official')
    mode.setBlocked(false)
    expect(mode.getSnapshot()).toEqual({ mode: 'space', blocked: true })
    mode.setBlocked(false, 'draft')
    expect(mode.getSnapshot()).toEqual({ mode: 'official', blocked: false })
  })

  it('双向切换释放增强注册与样式，重复切换不会重复装载', () => {
    const unregister = vi.fn()
    const slots: SlotsService = {
      inject: (_key, factory) => factory(),
      register: vi.fn(() => unregister),
    }
    const mode = createModeStore()
    const dispose = installSidebarMode(
      slots,
      mode,
      () => null,
      '.dsh-space-root{}',
    )
    expect(slots.register).toHaveBeenCalledTimes(1)
    expect(
      document.querySelectorAll('style[data-plugin="dsh-space"]'),
    ).toHaveLength(1)
    mode.setMode('official')
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(document.querySelector('style[data-plugin="dsh-space"]')).toBeNull()
    mode.setMode('official')
    mode.setMode('space')
    expect(slots.register).toHaveBeenCalledTimes(2)
    dispose()
    expect(unregister).toHaveBeenCalledTimes(2)
    expect(document.querySelector('style[data-plugin="dsh-space"]')).toBeNull()
    mode.setMode('official')
    mode.setMode('space')
    expect(slots.register).toHaveBeenCalledTimes(2)
  })

  it('保留模式偏好，官方模式启动不注入增强样式', () => {
    createModeStore().setMode('official')
    const mode = createModeStore()
    const slots: SlotsService = {
      inject: (_key, factory) => factory(),
      register: vi.fn(),
    }
    const dispose = installSidebarMode(slots, mode, () => null, 'css')
    expect(slots.register).not.toHaveBeenCalled()
    expect(mode.getSnapshot().mode).toBe('official')
    dispose()
  })

  it('弹窗期间延后跨页切换，解除占用后应用最后选择', () => {
    const mode = createModeStore()
    const off = mode.listen()
    mode.setBlocked(true)
    localStorage.setItem('dsh-space.sidebar.mode', 'official')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'dsh-space.sidebar.mode' }),
    )
    expect(mode.getSnapshot().mode).toBe('space')
    mode.setBlocked(false)
    expect(mode.getSnapshot().mode).toBe('official')
    off()
  })

  it('本地存储不可用仍能切换，装载失败不会残留样式', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const mode = createModeStore()
    mode.setMode('official')
    expect(mode.getSnapshot().mode).toBe('official')
    mode.setMode('space')
    expect(() =>
      installSidebarMode(
        {
          inject: (_key, factory) => factory(),
          register: () => {
            throw new Error('slot failure')
          },
        },
        mode,
        () => null,
        'css',
      ),
    ).toThrow('slot failure')
    expect(document.querySelector('style[data-plugin="dsh-space"]')).toBeNull()
  })
})
