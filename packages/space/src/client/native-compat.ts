import type { ReactLike, SlotsService } from './types.ts'
import { nativeComposer } from '../../.generated/native-input.ts'

export interface NativeState {
  draft: string
  imageIds: readonly string[]
  phase: string
  [key: string]: unknown
}

export interface NativeInput {
  state: { subscribe: (listener: () => void) => () => void, getSnapshot: () => NativeState }
  notices: { subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown }
  lexicon: { subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown }
  snapshot: NativeState
  actions: Record<string, unknown>
  setDraft: (text: string) => void
  addImages: (ids: readonly string[]) => boolean
  removeImage: (id: string) => void
  commitSend: (ids: readonly string[]) => void
  submit: () => void
  notify: (level: 'info' | 'error', text: string) => void
  dispose: () => void
}

export interface NativeEntry {
  component: (props: Record<string, any>) => unknown
  options: { priority?: number }
  registrant?: string
}

const revisions: Record<string, string> = {
  '@deepseek-ai/dsh-client-runtime': 'aba836a0c42d',
  '@deepseek-ai/dsh-client-ui-conversation': 'cf4575517765',
  '@deepseek-ai/dsh-client-ui-renderer': '79b59d365f3b',
}

/** 仅接入已验证的原生构建；不通过函数名或 DOM 猜测宿主版本 */
export function assertNativeCompatibility(graph: unknown): void {
  const entries = (graph as { entries?: Array<{ id: string, rev: string }> } | undefined)?.entries
  for (const [id, rev] of Object.entries(revisions)) {
    if (!entries?.some(entry => entry.id === id && entry.rev === rev))
      throw new Error('新会话输入扩展仅支持 DSH 0.1.1-rc.2 原生构建，请切换官方模式或更新兼容适配')
  }
}

export function createNativeComposer(require: (name: string) => unknown): {
  Shell: new (deps: Record<string, unknown>) => NativeInput
  Root: (props: Record<string, any>) => unknown
} {
  return nativeComposer(require) as unknown as ReturnType<typeof createNativeComposer>
}

/** 保留原注册的子 slot 授权，仅在当前页面替换指定组件，卸载时恢复原引用 */
export function extendNativeEntry(
  slots: SlotsService,
  key: string,
  wrap: (component: NativeEntry['component']) => NativeEntry['component'],
): () => void {
  const registry = slots as SlotsService & { entries: (key: string) => NativeEntry[] }
  const name = key === 'conversation' ? 'ConversationRoot' : 'InputBar'
  const entry = registry.entries(key).find(item => (item.options.priority ?? 0) === 0 && item.component.name === name)
  if (!entry || typeof entry.component !== 'function')
    throw new Error(`未找到原生输入注册：${key}`)
  const original = entry.component
  const next = wrap(original)
  entry.component = next
  // 登记低优先级占位以触发公开 registry 通知，不替换子 slot 的所有权
  let refresh: (() => void)
  try {
    refresh = slots.register({ name: key, priority: 10000 }, () => null)
  }
  catch (error) {
    entry.component = original
    throw error
  }
  return () => {
    if (entry.component === next)
      entry.component = original
    refresh()
  }
}

/** 当前实例的新建入口接管；恢复时不覆盖之后安装的其他扩展 */
export function extendNewSession(
  workspaces: { startSession: (workspaceId?: string) => void },
  begin: (workspaceId?: string) => void,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(workspaces, 'startSession')
  Object.defineProperty(workspaces, 'startSession', { configurable: true, writable: true, value: begin })
  return () => {
    if (workspaces.startSession !== begin)
      return
    if (descriptor)
      Object.defineProperty(workspaces, 'startSession', descriptor)
    else
      Reflect.deleteProperty(workspaces, 'startSession')
  }
}

export function selectSnapshot(value: unknown): (selector?: (snapshot: any) => unknown) => unknown {
  return selector => value === undefined ? undefined : selector ? selector(value) : value
}

export function useNativeSnapshot(React: ReactLike, source: NativeInput['notices']): unknown {
  return React.useSyncExternalStore(source.subscribe, source.getSnapshot)
}
