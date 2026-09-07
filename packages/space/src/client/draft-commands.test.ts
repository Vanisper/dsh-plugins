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
    commands: ['goal', 'plan', 'permission', 'clear'].map(name => ({ name, description: `${name} description`, ...(['goal', 'plan'].includes(name) ? { input: { hint: 'body' } } : {}) })),
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
  const pick = async (name: string) => {
    commands.toggle()
    await vi.waitFor(() => expect(commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    const index = commands.menu.getSnapshot().groups[0]!.items.findIndex(item => item.name === name)
    expect(index).toBeGreaterThanOrEqual(0)
    commands.pick('command', index)
  }
  const popupReady = async () => vi.waitFor(() => expect(commands.popup.state.getSnapshot().status).toBe('ready'))
  return { input, options, commands, fetch, client, sink, focus, pick, popupReady, setData: (next: Partial<DraftOptions>) => {
    data = { ...data, ...next }
  } }
}

describe('无实体原生命令适配', () => {
  it('目录来自后端和前端注册，未知命令有逐项禁用原因，不执行 Session handler', async () => {
    const h = harness()
    h.client.push({ name: 'extension', description: 'Extension' })
    await h.pick('clear')
    expect(h.input.notices.getSnapshot()).toMatchObject({ text: expect.stringContaining('尚未适配草稿') })
    const group = h.commands.menu.getSnapshot().groups[0]!
    expect(group.items.map(item => item.name)).toEqual(['goal', 'plan', 'permission', 'clear', 'model', 'extension'])
    expect(group.showGroupTitle).not.toBe(false)
    expect(group.items.find(item => item.name === 'clear')?.description).toBe('clear description')
    expect(h.sink).not.toHaveBeenCalled()
  })

  it.each(['plan', 'goal'] as const)('点选 %s 直接开启并关闭菜单，再次选择取消，不弹选项', async (name) => {
    const h = harness()
    h.input.setDraft('keep text')
    h.input.addImages(['image'])
    await h.pick(name)
    expect(h.options.intent).toBe(name)
    expect(h.commands.menu.getSnapshot().open).toBe(false)
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    expect(h.focus).toHaveBeenCalled()
    expect(h.input.snapshot).toMatchObject({ draft: 'keep text', imageIds: ['image'] })
    await h.pick(name)
    expect(h.options.intent).toBe('message')
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    expect(h.input.snapshot).toMatchObject({ draft: 'keep text', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('加号设置不把正文中的绝对路径或命令当成待替换 token', async () => {
    const h = harness()
    h.input.setDraft('/tmp/project 请检查这个目录')
    await h.pick('plan')
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
    h.commands.toggle()
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
    expect(h.options.explicit()).toEqual({ permission: 'workspace-write', intent: 'message', selection: { provider: 'p', model: 'm', reasoningEffort: 'low' } })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('目标标记不向正文插入命令，首次发送只交付一次正文与附件', async () => {
    const h = harness()
    h.input.setDraft('finish work')
    h.input.addImages(['image'])
    await h.pick('goal')
    expect(h.input.snapshot.draft).toBe('finish work')
    expect(h.options.intent).toBe('goal')
    expect(h.commands.menu.getSnapshot().open).toBe(false)
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    expect(h.sink).not.toHaveBeenCalled()
    h.input.submit()
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.sink.mock.calls[0]?.slice(0, 2)).toEqual(['finish work', ['image']])
  })

  it('计划和目标互相替换，重复选择与取消都保留正文和附件', async () => {
    const h = harness()
    h.input.setDraft('keep text')
    h.input.addImages(['image'])
    for (const intent of ['goal', 'plan', 'goal'] as const) {
      await h.pick(intent)
      expect(h.options.intent).toBe(intent)
      expect(h.commands.popup.state.getSnapshot().open).toBe(false)
      expect(h.input.snapshot).toMatchObject({ draft: 'keep text', imageIds: ['image'] })
    }
    h.options.setIntent('message')
    expect(h.input.snapshot).toMatchObject({ draft: 'keep text', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('菜单提示随当前意图更新，只改变模式命令的描述', async () => {
    const h = harness()
    h.commands.toggle()
    await h.options.load()
    const description = (name: string) => h.commands.menu.getSnapshot().groups[0]?.items.find(item => item.name === name)?.description
    expect(description('plan')).toBe('开启计划模式')
    expect(description('goal')).toBe('开启目标模式')
    expect(description('clear')).toBe('clear description')
    h.options.setIntent('plan')
    expect(description('plan')).toBe('退出计划模式')
    expect(description('goal')).toBe('开启目标模式')
    h.options.setIntent('goal')
    expect(description('plan')).toBe('开启计划模式')
    expect(description('goal')).toBe('取消目标模式')
    h.options.setIntent('message')
    expect(description('goal')).toBe('开启目标模式')
    expect(h.sink).not.toHaveBeenCalled()
  })

  it.each(['plan', 'goal'] as const)('已选 %s 时键入命令可选取消，键盘确认只消费命令 span', async (name) => {
    const h = harness()
    await h.pick(name)
    const text = `/${name} keep text`
    h.input.setDraft(text)
    h.input.addImages(['image'])
    h.commands.track(text, name.length + 1, { tier: 'plain' }, h.input.snapshot.draftRev)
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.items[0]?.description).toBe(name === 'plan' ? '退出计划模式' : '取消目标模式'))
    expect(h.commands.arbitrate('enter', true)).toBe('pass')
    expect(h.options.intent).toBe(name)
    h.commands.arbitrate('enter', false)
    expect(h.options.intent).toBe('message')
    expect(h.input.snapshot).toMatchObject({ draft: ' keep text', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it.each(['plan', 'goal'] as const)('重复提交裸 /%s 只取消模式，不发送或创建实体', async (name) => {
    const h = harness()
    await h.pick(name)
    h.input.setDraft(` /${name} `)
    h.input.addImages(['image'])
    h.input.submit()
    await vi.waitFor(() => expect(h.options.intent).toBe('message'))
    expect(h.input.snapshot).toMatchObject({ draft: '', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('计划下的裸 /goal 切换意图，含正文的前导 /goal 规范为目标和正文', async () => {
    const h = harness()
    h.options.setIntent('plan')
    h.input.setDraft('/goal')
    h.input.addImages(['image'])
    h.input.submit()
    await vi.waitFor(() => expect(h.options.intent).toBe('goal'))
    expect(h.input.snapshot).toMatchObject({ draft: '', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
    h.options.setIntent('plan')
    h.input.setDraft('/goal finish work')
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.options.intent).toBe('goal')
    expect(h.sink.mock.calls[0]?.slice(0, 2)).toEqual(['finish work', ['image']])
  })

  it('目标意图中的斜杠正文不再触发或执行嵌套命令', async () => {
    const h = harness()
    await h.pick('goal')
    h.input.setDraft('/plan review\n/feedback details')
    h.commands.track(h.input.snapshot.draft, h.input.snapshot.draft.length, { tier: 'plain' }, h.input.snapshot.draftRev)
    expect(h.commands.menu.getSnapshot().open).toBe(false)
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.options.intent).toBe('goal')
    expect(h.sink.mock.calls[0]?.[0]).toBe('/plan review\n/feedback details')
  })

  it.each(['', 'clear', 'PAUSE', 'resume', 'edit', 'edit objective'])('目标意图拒绝空目标或管理参数 %s，保留全部内容', async (text) => {
    const h = harness()
    await h.pick('goal')
    h.input.setDraft(text)
    h.input.addImages(['image'])
    h.input.submit()
    await vi.waitFor(() => expect(h.input.notices.getSnapshot()).not.toBeNull())
    expect(h.sink).not.toHaveBeenCalled()
    expect(h.input.snapshot).toMatchObject({ draft: text, imageIds: ['image'] })
    expect(h.options.intent).toBe('goal')
  })

  it('行内斜杠沿用原生规则，排除接收正文的命令，加号仍展示完整目录', async () => {
    const h = harness()
    h.input.setDraft('/plan review\n/')
    h.commands.track(h.input.snapshot.draft, h.input.snapshot.draft.length, { tier: 'plain' }, h.input.snapshot.draftRev)
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    expect(h.commands.menu.getSnapshot().groups[0]!.items.map(item => item.name)).toEqual(['permission', 'clear', 'model'])
    h.commands.close()
    await h.pick('goal')
    expect(h.options.intent).toBe('goal')
    expect(h.input.snapshot.draft).toBe('/plan review\n/')
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('只移动光标也会更新命令位置和待消费 token，目标键盘选择不留下前缀', async () => {
    const h = harness()
    h.input.setDraft('/\n/')
    h.commands.track('/\n/', 3, { tier: 'plain' }, h.input.snapshot.draftRev)
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    expect(h.commands.menu.getSnapshot().groups[0]!.items.map(item => item.name)).not.toContain('goal')
    h.commands.track('/\n/', 1, { tier: 'plain' }, h.input.snapshot.draftRev)
    expect(h.commands.menu.getSnapshot().groups[0]!.items.map(item => item.name)).toContain('goal')
    const index = h.commands.menu.getSnapshot().groups[0]!.items.findIndex(item => item.name === 'goal')
    h.commands.pick('command', index)
    expect(h.input.snapshot.draft.trim()).toBe('/')
    expect(h.options.intent).toBe('goal')
    expect(h.sink).not.toHaveBeenCalled()
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

  it.each(['/goal clear', '/goal pause', '/goal resume', '/goal edit', '/goal edit changed'])('拒绝已有目标控制命令 %s，不创建实体', async (line) => {
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

  it('plan 的 off 只改配置，带正文的命令保留原生解析，不将正文解释成嵌套指令', async () => {
    const h = harness()
    h.options.setIntent('plan')
    h.input.setDraft('/plan off')
    h.input.submit()
    await vi.waitFor(() => expect(h.input.snapshot.draft).toBe(''))
    expect(h.options.intent).toBe('message')
    h.input.setDraft('/plan /goal review changes')
    h.input.submit()
    await vi.waitFor(() => expect(h.sink).toHaveBeenCalledTimes(1))
    expect(h.sink.mock.calls[0]?.[0]).toBe('/plan /goal review changes')
    expect(h.options.intent).toBe('message')
  })

  it('提交裸 /plan 直接启用配置，只消费命令文本，不发送附件或弹出选项', async () => {
    const h = harness()
    h.input.setDraft('  /plan  ')
    h.input.addImages(['image'])
    h.input.submit()
    await vi.waitFor(() => expect(h.options.intent).toBe('plan'))
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    expect(h.input.snapshot).toMatchObject({ draft: '', imageIds: ['image'] })
    expect(h.sink).not.toHaveBeenCalled()
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
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
    expect(h.input.snapshot.draft).toBe('')
    expect(h.options.intent).toBe('plan')
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('下一次打开反映新增和卸载的注册，目录不添加附件等自定义入口', async () => {
    const h = harness()
    await h.pick('clear')
    h.commands.close()
    h.client.push({ name: 'extension', description: 'Extension' })
    h.setData({ commands: [{ name: 'custom-host', description: 'Custom host' }] })
    await h.pick('extension')
    expect(h.commands.menu.getSnapshot().groups[0]!.items).toEqual([
      { name: 'custom-host', description: 'Custom host', disabledReason: expect.any(String) },
      { name: 'model', description: 'Model', disabledReason: undefined },
      { name: 'extension', description: 'Extension', disabledReason: expect.any(String) },
    ])
    h.commands.close()
    h.client.pop()
    h.setData({ commands: [] })
    h.commands.toggle()
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    expect(h.commands.menu.getSnapshot().groups[0]!.items.map(item => item.name)).toEqual(['model'])
    expect(h.sink).not.toHaveBeenCalled()
  })

  it('目录失败可原位重试，成功后不保留过期错误或虚构命令', async () => {
    const h = harness()
    h.setData({ commands: undefined, commandError: 'offline' })
    await h.pick('重试命令目录')
    h.setData({ commands: [{ name: 'plan', description: 'Plan' }], commandError: undefined })
    await h.options.load()
    h.commands.close()
    await h.pick('plan')
    expect(h.options.intent).toBe('plan')
    expect(h.commands.popup.state.getSnapshot().open).toBe(false)
  })

  it('冲突和缺失的命令不被内置适配器偷偷补回', async () => {
    const h = harness()
    h.setData({ commands: [{ name: 'model', description: 'Collision' }] })
    h.commands.toggle()
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
    h.input.setDraft('/model')
    await h.pick('model')
    await h.popupReady()
    h.input.setDraft('new draft')
    await h.commands.popup.select(0)
    expect(h.commands.popup.state.getSnapshot().error).toContain('草稿已变化')
    expect(h.options.explicit().selection).toBeUndefined()
    h.commands.popup.dismiss({ focusComposer: true })
    expect(h.input.snapshot.draft).toBe('new draft')
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it.each(['plan', 'goal'])('草稿变化后拒绝旧菜单中的 %s，不消费新正文或改变配置', async (name) => {
    const h = harness()
    h.input.setDraft('/pl')
    h.commands.toggle()
    await vi.waitFor(() => expect(h.commands.menu.getSnapshot().groups[0]?.status).toBe('ready'))
    const index = h.commands.menu.getSnapshot().groups[0]!.items.findIndex(item => item.name === name)
    h.input.setDraft('new draft')
    h.commands.pick('command', index)
    expect(h.options.intent).toBe('message')
    expect(h.input.snapshot.draft).toBe('new draft')
    expect(h.sink).not.toHaveBeenCalled()
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

  it('等待命令目录时取消目标意图，迟到结果不改变新意图或发送', async () => {
    const h = harness()
    await h.pick('goal')
    let resolve!: () => void
    const load = h.fetch.getMockImplementation()!
    h.fetch.mockImplementationOnce(async () => {
      await new Promise<void>((done) => {
        resolve = done
      })
      return load()
    })
    h.input.setDraft('delayed objective')
    h.input.submit()
    h.options.setIntent('message')
    resolve()
    await h.options.load()
    expect(h.sink).not.toHaveBeenCalled()
    expect(h.input.snapshot.draft).toBe('delayed objective')
    expect(h.input.notices.getSnapshot()).toBeNull()
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
