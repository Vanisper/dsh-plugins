import type { DraftModelSelection, DraftOptions } from '../shared/draft-options.ts'
import type { ObservableSnapshot } from './types.ts'

interface DraftOptionState extends DraftOptions {
  status: 'idle' | 'loading' | 'ready' | 'error'
  routable: boolean | null
  error: string | null
}

export interface DraftOptionStore extends ObservableSnapshot<DraftOptionState> {
  load: () => Promise<void>
  select: (next: DraftModelSelection) => Promise<boolean>
  command: (line: string) => Promise<boolean>
  readonly plan: boolean
  setPlan: (value: boolean) => void
  explicit: () => { selection?: DraftModelSelection, permission?: string, plan: boolean }
  reset: () => void
  dispose: () => void
}

/** 草稿选择不写宿主；仅在实体创建后应用显式选项 */
export function createDraftOptions(): DraftOptionStore {
  let state: DraftOptionState = {
    current: null,
    groups: [],
    failures: [],
    status: 'idle',
    routable: null,
    error: null,
  }
  let selection: DraftModelSelection | undefined
  let permission: string | undefined
  let plan = false
  let disposed = false
  let inFlight: Promise<void> | undefined
  let baseline: DraftOptions | undefined
  let controller: AbortController | undefined
  const listeners = new Set<() => void>()
  const publish = (next: typeof state): void => {
    if (disposed)
      return
    state = next
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load(): Promise<void> {
      if (disposed)
        return Promise.resolve()
      if (inFlight)
        return inFlight
      controller = new AbortController()
      publish({ ...state, status: 'loading', error: null })
      inFlight = (async () => {
        try {
          const response = await fetch('/api/dsh-space/draft-options', { cache: 'no-store', signal: AbortSignal.any([controller!.signal, AbortSignal.timeout(15000)]) })
          if (!response.ok)
            throw new Error('新会话选项读取失败')
          const options = await response.json() as DraftOptions
          baseline = options
          publish({
            ...state,
            ...options,
            current: selection ?? options.current,
            permissions: options.permissions && { ...options.permissions, currentValue: permission ?? options.permissions.currentValue },
            status: 'ready',
            error: null,
          })
        }
        catch (cause) {
          publish({ ...state, status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
        }
        finally {
          inFlight = undefined
        }
      })()
      return inFlight
    },
    async select(next: DraftModelSelection): Promise<boolean> {
      selection = { ...next }
      publish({ ...state, current: selection })
      return true
    },
    async command(line: string): Promise<boolean> {
      const prefix = '/permission '
      if (!line.startsWith(prefix))
        return false
      const value = line.slice(prefix.length)
      if (!state.permissions?.options.some(item => item.value === value))
        return false
      permission = value
      publish({ ...state, permissions: { ...state.permissions, currentValue: value } })
      return true
    },
    get plan() { return plan },
    setPlan(value: boolean): void {
      plan = value
      publish({ ...state })
    },
    explicit: () => ({ selection, permission, plan }),
    reset(): void {
      selection = undefined
      permission = undefined
      plan = false
      publish({ ...state, current: baseline?.current ?? null, permissions: baseline?.permissions })
      void this.load()
    },
    dispose(): void {
      disposed = true
      controller?.abort()
      listeners.clear()
    },
  }
}
