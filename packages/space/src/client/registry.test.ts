import type { RegistryPayload } from './types.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRegistry } from './api.ts'
import { observeRegistry } from './registry.ts'

vi.mock('./api.ts', () => ({ fetchRegistry: vi.fn() }))

const snapshot: RegistryPayload = { ok: true, root: '/root', items: [], invalidSpaces: [], invalidChats: [] }
let page: EventTarget & { visibilityState: string }
let stop: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', new EventTarget())
  vi.mocked(fetchRegistry).mockResolvedValue(snapshot)
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('附加描述同步', () => {
  it('无需本地写操作即可同步命令或其他页面的修改', async () => {
    const receive = vi.fn()
    stop = observeRegistry(receive)
    await vi.advanceTimersByTimeAsync(0)
    expect(receive).toHaveBeenLastCalledWith(snapshot)
    const next = { ...snapshot, items: [{ kind: 'space' as const, workspaceId: 'w', path: '/w', title: 'Space', sessionIds: [] }] }
    vi.mocked(fetchRegistry).mockResolvedValue(next)
    await vi.advanceTimersByTimeAsync(3000)
    expect(receive).toHaveBeenLastCalledWith(next)
  })

  it('失败时清空旧描述，恢复后自动回到增强投影', async () => {
    const receive = vi.fn()
    stop = observeRegistry(receive)
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(fetchRegistry).mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(receive).toHaveBeenLastCalledWith(undefined, 'offline')
    await vi.advanceTimersByTimeAsync(3000)
    expect(receive).toHaveBeenLastCalledWith(snapshot)
  })

  it('隐藏时暂停请求，重新显示和聚焦时立即读取', async () => {
    stop = observeRegistry(vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetchRegistry).toHaveBeenCalledTimes(1)
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchRegistry).toHaveBeenCalledTimes(3)
  })

  it('旧响应不能覆盖新请求，卸载后不再写入或轮询', async () => {
    let complete: (value: RegistryPayload) => void = () => {}
    vi.mocked(fetchRegistry).mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    const receive = vi.fn()
    stop = observeRegistry(receive)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    complete({ ...snapshot, root: '/old' })
    await vi.advanceTimersByTimeAsync(0)
    expect(receive).toHaveBeenCalledTimes(1)
    stop()
    await vi.advanceTimersByTimeAsync(10000)
    window.dispatchEvent(new Event('focus'))
    expect(fetchRegistry).toHaveBeenCalledTimes(2)
  })

  it('超时后降级且允许下一轮重试', async () => {
    vi.mocked(fetchRegistry).mockImplementationOnce(signal => new Promise((_, reject) => {
      signal!.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const receive = vi.fn()
    stop = observeRegistry(receive)
    await vi.advanceTimersByTimeAsync(5000)
    expect(receive).toHaveBeenLastCalledWith(undefined, '读取附加描述超时')
    await vi.advanceTimersByTimeAsync(3000)
    expect(receive).toHaveBeenLastCalledWith(snapshot)
  })
})
