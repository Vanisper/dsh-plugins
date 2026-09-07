import type { DraftCommand, DraftOptions } from '../shared/draft-options.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftCommands } from './draft-commands.ts'
import { createDraftOptions } from './draft-options.ts'
import { createNativeCommandUI, createNativeComposer, readNativeClientCommands } from './native-compat.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).reverse().forEach(off => off())
  vi.unstubAllGlobals()
})

function harness() {
  let data: DraftOptions = {
    current: { provider: 'p', model: 'm' },
    groups: [{ id: 'p', name: 'Provider', models: [{ id: 'm', name: 'Model', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }] } }] }],
    failures: [],
    permissions: { currentValue: 'read-only', options: [{ value: 'read-only', name: 'Read Only' }, { value: 'workspace-write', name: 'Workspace Write' }, { value: 'danger-full-access', name: 'danger-full-access' }] },
    commands: ['goal', 'plan', 'permission', 'clear'].map(name => ({ name, description: `${name} description` })),
  }
  const fetch = vi.fn(async () => ({ ok: true, json: async () => data }))
  vi.stubGlobal('fetch', fetch)
  const require = (name: string): unknown => name === '@deepseek-ai/dsh-client-runtime/client'
    ? { createSnapshotStore: <T>(value: T) => {
        const listeners = new Set<() => void>()
        return {
          getSnapshot: () => value,
          set: (next: T) => {
            value = next
            listeners.forEach(listener => listener())
          },
          subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
      } }
    : {}
  const options = createDraftOptions()
  const sink = vi.fn(async (_text: string, _images: readonly string[]) => ({ kind: 'success' }))
  let commands: ReturnType<typeof createDraftCommands>
  const { Shell } = createNativeComposer(require)
  const input = new Shell({ actx: {}, defaultSink: sink, commandImages: {}, inputTriggers: () => commands, popup: () => commands?.popup })
  const client: DraftCommand[] = [{ name: 'model', description: 'Model' }]
  const focus = vi.fn()
  commands = createDraftCommands(createNativeCommandUI(require, key => key), options, input, () => client, focus)
  cleanups.push(() => {
    commands.dispose()
    input.dispose()
    options.dispose()
  })
  const images = vi.fn()
  const pick = async (name: string) => {
    commands.toggle(images)
    await vi.waitFor(() => expect(commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    const index = commands.menu.getSnapshot().groups[0]!.items.findIndex(item => item.name === name)
    expect(index).toBeGreaterThanOrEqual(0)
    commands.pick('command', index)
  }
  const popupReady = async () => vi.waitFor(() => expect(commands.popup.state.getSnapshot().status).toBe('ready'))
  return { input, options, commands, fetch, client, sink, focus, images, pick, popupReady, setData: (next: Partial<DraftOptions>) => {
    data = { ...data, ...next }
  } }
}

describe('无实体原生命令适配', () => {
  it('目录来自后端和前端注册，未知命令有逐项禁用原因，不执行 Session handler', async () => {
    const h = harness()
    h.client.push({ name: 'extension', description: 'Extension' })
    await h.pick('clear')
    expect(h.input.notices.getSnapshot()).toMatchObject({ text: expect.stringContaining('尚未适配草稿') })
    expect(h.commands.menu.getSnapshot().groups[0]!.items.map(item => item.name)).toEqual(['添加图片', 'clear', 'extension', 'goal', 'model', 'permission', 'plan'])
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('配置 Plan 保留文本和附件，使用原生选项控制器并可再次关闭', async () => {
    const h = harness()
    h.input.setDraft('keep text')
    h.input.addImages(['image'])
    await h.pick('plan')
    await h.popupReady()
    await h.commands.popup.select(0)
    expect(h.options.plan).toBe(true)
    expect(h.input.snapshot).toMatchObject({ draft: 'keep text', imageIds: ['image'] })
    await h.pick('plan')
    await h.popupReady()
    await h.commands.popup.select(1)
    expect(h.options.plan).toBe(false)
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('加号设置不把正文中的绝对路径或命令当成待替换 token', async () => {
    const h = harness()
    h.input.setDraft('/tmp/project 请检查这个目录')
    await h.pick('plan')
    await h.popupReady()
    await h.commands.popup.select(0)
    expect(h.input.snapshot.draft).toBe('/tmp/project 请检查这个目录')
    h.input.setDraft('/goal existing objective')
    await h.pick('goal')
    expect(h.input.snapshot.draft).toBe('/goal existing objective')
  })

  it('同一次打开内的查询细化复用目录，下一次打开才重新读取', async () => {
    const h = harness()
    h.input.setDraft('/p')
    h.commands.track('/p', 2, { tier: 'plain' }, h.input.snapshot.draftRev)
    await h.options.load()
    h.input.setDraft('/pl')
    h.commands.track('/pl', 3, { tier: 'plain' }, h.input.snapshot.draftRev)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.commands.menu.getSnapshot().groups[0]?.items.map(item => item.name)).toEqual(['plan'])
    h.commands.close()
    h.commands.toggle(h.images)
    await h.options.load()
    expect(h.fetch).toHaveBeenCalledTimes(2)
  })

  it('权限和模型弹窗只保存显式草稿配置', async () => {
    const h = harness()
    await h.pick('permission')
    await h.popupReady()
    await h.commands.popup.select(1)
    await h.pick('model')
    await h.popupReady()
    h.commands.popup.setSearch('Low')
    await h.commands.popup.select(0)
    expect(h.options.explicit()).toEqual({ permission: 'workspace-write', plan: false, selection: { provider: 'p', model: 'm', reasoningEffort: 'low' } })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('填写 goal 不创建实体，首次发送才交给真实输入执行一次', async () => {
    const h = harness()
    h.input.setDraft('finish work')
    h.input.addImages(['image'])
    await h.pick('goal')
    expect(h.input.snapshot.draft).toBe('/goal finish work')
    expect(h.sink).not.toHaveBeenCalled()
    h.input.submit()
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.sink.mock.calls[0]?.slice(0, 2)).toEqual(['/goal finish work', ['image']])
  })

  it.each([false, true])('完整权限沿用原生风险确认，不能通过手写命令绕过（手写：%s）', async (typed) => {
    const h = harness()
    h.input.addImages(['image'])
    if (typed) {
      h.input.setDraft('/permission danger-full-access')
      h.input.submit()
    }
    else {
      await h.pick('permission')
    }
    await h.popupReady()
    await h.commands.popup.select(typed ? 0 : 2)
    expect(h.commands.popup.state.getSnapshot().confirming?.id).toBe('danger-full-access')
    await h.commands.popup.confirm()
    expect(h.options.explicit().permission).toBeUndefined()
    h.commands.popup.acknowledge(true)
    await h.commands.popup.confirm()
    expect(h.options.explicit().permission).toBe('danger-full-access')
    expect(h.input.snapshot.imageIds).toEqual(['image'])
    expect(h.sink).not.toHaveBeenCalled()
  })

  it.each(['/goal', '/goal clear', '/goal pause', '/goal resume', '/goal edit', '/goal edit changed'])('拒绝无目标或已有目标控制命令 %s，不创建实体', async (line) => {
    const h = harness()
    h.input.setDraft(line)
    h.input.submit()
    await vi.waitFor(() => expect(h.input.notices.getSnapshot()).not.toBeNull())
    expect(h.sink).not.toHaveBeenCalled()
    expect(h.input.snapshot.draft).toBe(line)
  })

  it('手写权限命令只消费命令文本，附件保留；未知命令不降级成普通发送', async () => {
    const h = harness()
    h.input.setDraft('/permission workspace-write')
    h.input.addImages(['image'])
    h.input.submit()
    await vi.waitFor(() => expect(h.input.snapshot.draft).toBe(''))
    expect(h.input.snapshot.imageIds).toEqual(['image'])
    expect(h.options.explicit().permission).toBe('workspace-write')
    h.input.setDraft('/clear')
    h.input.submit()
    await vi.waitFor(() => expect(h.input.notices.getSnapshot()).not.toBeNull())
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('保留原生 plan 参数语义：off 只改配置，其他参数作为待发送内容', async () => {
    const h = harness()
    h.options.setPlan(true)
    h.input.setDraft('/plan off')
    h.input.submit()
    await vi.waitFor(() => expect(h.input.snapshot.draft).toBe(''))
    expect(h.options.plan).toBe(false)
    h.input.setDraft('/plan review changes')
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.sink.mock.calls[0]?.[0]).toBe('/plan review changes')
  })

  it('原生触发检测与模糊搜索过滤目录，方向键和 Enter 选择，不干扰 IME', async () => {
    const h = harness()
    h.input.setDraft('/pl')
    h.commands.track('/pl', 3, { tier: 'plain' }, h.input.snapshot.draftRev)
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.items.map(item => item.name)).toEqual(['plan']))
    expect(h.commands.arbitrate('enter', true)).toBe('pass')
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    h.commands.arbitrate('down', false)
    h.commands.arbitrate('enter', false)
    await h.popupReady()
    await h.commands.popup.select(0)
    expect(h.input.snapshot.draft).toBe('')
    expect(h.options.plan).toBe(true)
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('附件入口仍只在点击时调用，退出和目录读取不会打开文件选择器', async () => {
    const h = harness()
    await h.pick('添加图片')
    expect(h.images).toHaveBeenCalledTimes(1)
    h.commands.toggle(h.images)
    h.commands.arbitrate('escape', false)
    await h.options.load()
    expect(h.images).toHaveBeenCalledTimes(1)
    expect(h.commands.menu.getSnapshot().open).toBe(false)
  })

  it('目录失败可原位重试，成功后不保留过期错误或虚构命令', async () => {
    const h = harness()
    h.setData({ commands: undefined, commandError: 'offline' })
    await h.pick('重试命令目录')
    h.setData({ commands: [{ name: 'plan', description: 'Plan' }], commandError: undefined })
    await h.options.load()
    h.commands.close()
    await h.pick('plan')
    await h.popupReady()
    expect(h.commands.popup.state.getSnapshot().options).toHaveLength(2)
  })

  it('冲突和缺失的命令不被内置适配器偷偷补回', async () => {
    const h = harness()
    h.setData({ commands: [{ name: 'model', description: 'Collision' }] })
    h.commands.toggle(h.images)
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.items.at(-1)?.description).toContain('重名'))
    h.commands.close()
    h.setData({ commands: [] })
    h.input.setDraft('/plan')
    h.input.submit()
    await vi.waitFor(() => expect(h.input.notices.getSnapshot()).toMatchObject({ text: expect.stringContaining('暂不支持') }))
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('草稿变化后拒绝旧选项，取消不消费文字或附件', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = harness()
    h.input.setDraft('/plan')
    await h.pick('plan')
    await h.popupReady()
    h.input.setDraft('new draft')
    await h.commands.popup.select(0)
    expect(h.commands.popup.state.getSnapshot().error).toContain('草稿已变化')
    expect(h.options.plan).toBe(false)
    h.commands.popup.dismiss({ focusComposer: true })
    expect(h.input.snapshot.draft).toBe('new draft')
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('切换视图、丢弃或卸载后，晚到的命令目录不能创建实体', async () => {
    const h = harness()
    let resolve!: () => void
    const load = h.fetch.getMockImplementation()!
    h.fetch.mockImplementationOnce(async () => {
      await new Promise<void>((done) => {
        resolve = done
      })
      return load()
    })
    h.input.setDraft('/goal delayed')
    h.input.submit()
    h.commands.close()
    resolve()
    await h.options.load()
    await Promise.resolve()
    expect(h.sink).not.toHaveBeenCalled()
    expect(h.input.snapshot.draft).toBe('/goal delayed')
  })
})

describe('原生前端目录兼容访问', () => {
  it('读取描述符但不运行 available，不带出私有 handler', () => {
    const available = vi.fn(() => {
      throw new Error('requires session')
    })
    const ctx = { get: () => ({ live: { contributions: new Map([['model', { name: 'model', description: 'Model', available, ui: {} }]]) } }) }
    expect(readNativeClientCommands(ctx)).toEqual([{ name: 'model', description: 'Model' }])
    expect(available).not.toHaveBeenCalled()
    expect(() => readNativeClientCommands({ get: () => ({}) })).toThrow('前端命令目录')
  })
})
