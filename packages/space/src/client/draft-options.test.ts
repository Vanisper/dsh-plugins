import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftOptions } from './draft-options.ts'

const data = {
  current: { provider: 'p', model: 'default' },
  groups: [],
  failures: [],
  permissions: { currentValue: 'workspace-write', options: [{ value: 'workspace-write', name: 'Workspace Write' }] },
}
afterEach(() => vi.unstubAllGlobals())

describe('草稿配置选择', () => {
  it('默认值只用于展示，用户选择才产生待应用配置', async () => {
    const fetch = vi.fn(async (_url: string, _options?: RequestInit) => ({ ok: true, json: async () => data }))
    vi.stubGlobal('fetch', fetch)
    const options = createDraftOptions()
    await options.load()
    expect(options.getSnapshot().current).toEqual(data.current)
    expect(options.explicit()).toEqual({ selection: undefined, permission: undefined, intent: 'message' })
    await options.select({ provider: 'p', model: 'other', reasoningEffort: 'high' })
    options.setIntent('plan')
    await options.load()
    expect(options.getSnapshot().current?.model).toBe('other')
    expect(options.explicit().intent).toBe('plan')
    expect(fetch.mock.calls.length).toBe(2)
    expect(fetch.mock.calls.every(call => !('method' in (call[1] ?? {})))).toBe(true)
    options.dispose()
  })

  it('不接受目录外的权限值，丢弃后不继承用户显式选项', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
    const options = createDraftOptions()
    await options.load()
    expect(await options.command('/permission made-up')).toBe(false)
    expect(await options.command('/permission workspace-write')).toBe(true)
    expect(options.explicit().permission).toBe('workspace-write')
    await options.select({ provider: 'p', model: 'other' })
    options.reset()
    expect(options.getSnapshot().current).toEqual(data.current)
    await options.load()
    expect(options.explicit().permission).toBeUndefined()
    options.dispose()
  })

  it('重叠读取合并，失败保留已知值并可重试', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => data }))
    vi.stubGlobal('fetch', fetch)
    const options = createDraftOptions()
    const first = options.load()
    expect(options.load()).toBe(first)
    await first
    fetch.mockRejectedValueOnce(new Error('offline'))
    await options.load()
    expect(options.getSnapshot()).toMatchObject({ status: 'error', current: data.current })
    await options.load()
    expect(options.getSnapshot().status).toBe('ready')
    options.dispose()
  })

  it('计划和目标是单选草稿意图，重载保留，丢弃清除', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
    const options = createDraftOptions()
    options.setIntent('plan')
    options.setIntent('goal')
    await options.load()
    expect(options.explicit().intent).toBe('goal')
    options.setIntent('plan')
    expect(options.intent).toBe('plan')
    options.reset()
    expect(options.intent).toBe('message')
    await options.load()
    expect(options.intent).toBe('message')
    options.dispose()
  })
})
