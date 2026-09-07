import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { assertNativeCompatibility, createNativeComposer, extendNativeEntry, extendNewSession, pauseInitialSelection } from './native-compat.ts'

function store<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: T) {
      state = next
      listeners.forEach(listener => listener())
    },
  }
}

function shell(sink = vi.fn(async () => ({ kind: 'success' }))) {
  const { Shell } = createNativeComposer((id) => {
    if (id === '@deepseek-ai/dsh-client-runtime/client')
      return { createSnapshotStore: store }
    return {}
  })
  return { input: new Shell({ actx: {}, defaultSink: sink, commandImages: {} }), sink }
}

describe('锁定版本的原生输入复用', () => {
  it('没有 Session 或会话作用域也可以编辑、带附件提交', async () => {
    const { input, sink } = shell()
    input.setDraft('first message')
    input.addImages(['image'])
    input.submit()
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(input.snapshot.draft).toBe(''))
    expect(sink.mock.calls[0]?.slice(0, 2)).toEqual(['first message', ['image']])
    expect(input.snapshot.imageIds).toEqual([])
    input.dispose()
  })

  it('创建失败时由原生状态机保留文本和附件，重复提交只执行一次', async () => {
    let reject!: (cause: Error) => void
    const pending = new Promise<{ kind: string }>((_resolve, fail) => {
      reject = fail
    })
    const { input, sink } = shell(vi.fn(() => pending))
    input.setDraft('keep')
    input.addImages(['image'])
    input.submit()
    input.submit()
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1))
    reject(new Error('not created'))
    await vi.waitFor(() => expect(input.snapshot.phase).toBe('plain'))
    expect(input.snapshot).toMatchObject({ draft: 'keep', imageIds: ['image'] })
    input.dispose()
  })

  it('提交纯附件并保持原生输入动作', async () => {
    const { input, sink } = shell()
    input.addImages(['image'])
    input.submit()
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1))
    expect(typeof input.actions.setDraft).toBe('function')
    expect(typeof input.actions.submit).toBe('function')
    input.dispose()
  })
})

describe('可撤销宿主兼容扩展', () => {
  it('暂停准确的启动订阅，官方模式恢复原策略且卸载不重建宿主', async () => {
    const ctx = new Context()
    const off = vi.fn()
    const workspace = {
      initialSelectionStarted: false,
      startInitialSelection: vi.fn(() => {
        workspace.initialSelectionStarted = true
        return off
      }),
    }
    const runtime = (ctx: Context): void => {
      ctx.reflect.provide('workspaces', workspace, undefined)
      ctx.effect(() => workspace.startInitialSelection(), 'runtime: initial Workspace selection')
    }
    const fiber = await ctx.plugin(runtime)
    const require = (id: string): unknown => id === '@deepseek-ai/cordis' ? { Context } : runtime
    const undo = pauseInitialSelection(ctx, require, workspace)
    expect(off).toHaveBeenCalledTimes(1)
    undo()
    undo()
    expect(workspace.startInitialSelection).toHaveBeenCalledTimes(2)
    const undoAgain = pauseInitialSelection(ctx, require, workspace)
    await fiber.dispose()
    expect(undoAgain).not.toThrow()
    expect(workspace.startInitialSelection).toHaveBeenCalledTimes(2)
  })

  it('没有对应启动 effect 时拒绝接入，不关闭不相关运行时', () => {
    const ctx = new Context()
    expect(() => pauseInitialSelection(ctx, () => ({ Context }), {})).toThrow('启动选择策略')
  })

  it('拒绝未知宿主构建，不根据版本文案猜测兼容性', () => {
    expect(() => assertNativeCompatibility(undefined)).toThrow('仅支持')
    const graph = { entries: [
      { id: '@deepseek-ai/dsh-client-runtime', rev: 'aba836a0c42d' },
      { id: '@deepseek-ai/dsh-client-ui-conversation', rev: 'cf4575517765' },
      { id: '@deepseek-ai/dsh-client-ui-renderer', rev: '79b59d365f3b' },
      { id: '@deepseek-ai/dsh-client-ui-model-selection', rev: '639da97bfe66' },
      { id: '@deepseek-ai/dsh-client-ui-input-trigger', rev: 'b9564b9138a7' },
      { id: '@deepseek-ai/dsh-client-ui-commands', rev: '887c0ca028a4' },
      { id: '@deepseek-ai/dsh-client-ui-plan', rev: '7f9f228f9516' },
      { id: '@deepseek-ai/dsh-client-ui-permission-presets', rev: 'e36eeb24d0eb' },
    ] }
    expect(() => assertNativeCompatibility(graph)).not.toThrow()
    graph.entries[0]!.rev = 'unknown'
    expect(() => assertNativeCompatibility(graph)).toThrow('仅支持')
  })

  it('原位组件扩展保留同一注册身份，撤销后恢复原组件', () => {
    function ConversationRoot() {
      return null
    }
    const entry = { component: ConversationRoot, options: {} }
    const unregister = vi.fn()
    const slots = { entries: () => [entry], register: vi.fn(() => unregister), inject: vi.fn() }
    const replacement = () => null
    const undo = extendNativeEntry(slots, 'conversation', () => replacement)
    expect(entry.component).toBe(replacement)
    expect(slots.entries()[0]).toBe(entry)
    undo()
    expect(entry.component).toBe(ConversationRoot)
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('登记失败不遗留被修改的原生组件', () => {
    function ConversationRoot() {
      return null
    }
    const entry = { component: ConversationRoot, options: {} }
    const slots = {
      entries: () => [entry],
      register: () => {
        throw new Error('conflict')
      },
      inject: vi.fn(),
    }
    expect(() => extendNativeEntry(slots, 'conversation', () => () => null)).toThrow('conflict')
    expect(entry.component).toBe(ConversationRoot)
  })

  it('只接管实例新建方法，恢复原型查找且不改动类原型', () => {
    const original = vi.fn()
    const prototype = { startSession: original }
    const workspaces = Object.create(prototype)
    const begin = vi.fn()
    const undo = extendNewSession(workspaces, begin)
    workspaces.startSession('project')
    expect(begin).toHaveBeenCalledWith('project')
    expect(original).not.toHaveBeenCalled()
    expect(prototype.startSession).toBe(original)
    undo()
    expect(Object.hasOwn(workspaces, 'startSession')).toBe(false)
    expect(workspaces.startSession).toBe(original)
  })

  it('卸载不覆盖后来接管同一方法的扩展', () => {
    const workspaces = { startSession: vi.fn() }
    const undo = extendNewSession(workspaces, vi.fn())
    const another = vi.fn()
    workspaces.startSession = another
    undo()
    expect(workspaces.startSession).toBe(another)
  })
})
