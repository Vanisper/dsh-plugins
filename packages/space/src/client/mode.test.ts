// @vitest-environment jsdom
import type { SlotsService } from './types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModeStore, installSidebarMode } from './mode.ts'

afterEach(() => {
  localStorage.clear()
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

describe('工作区模式生命周期', () => {
  it('侧栏与准备页分别释放占用，不相互解锁', () => {
    const mode = createModeStore()
    mode.setBlocked(true)
    mode.setBlocked(true, 'preparation')
    mode.setMode('official')
    mode.setBlocked(false)
    expect(mode.getSnapshot()).toEqual({ mode: 'space', blocked: true })
    mode.setBlocked(false, 'preparation')
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
