import type { ObservableSnapshot } from './types.ts'

export interface PreparationState {
  active: boolean
  draft: string
  targetId?: string
  workspaceId?: string
  creationId?: string
  sessionId?: string
  phase: 'editing' | 'connecting' | 'handoff'
  submit: boolean
  error?: string
}

export interface PreparationPort {
  allocate: (creationId: string) => Promise<string>
  connect: (workspaceId: string) => Promise<string>
  open: (sessionId: string) => void
  transfer: (sessionId: string, draft: string, submit: boolean) => void
}

export interface Preparation extends ObservableSnapshot<PreparationState> {
  begin: (targetId?: string) => void
  resume: () => void
  suspend: () => void
  discard: () => void
  setDraft: (text: string) => void
  setTarget: (targetId?: string) => void
  connect: (submit: boolean) => Promise<void>
  deliver: (sessionId: string) => void
  failHandoff: (message: string) => void
  dispose: () => void
}

/** 准备页只拥有未交接文本；实体分配后锁定目标，重试复用同一工作区和会话 */
export function createPreparation(port: PreparationPort): Preparation {
  const empty = (): PreparationState => ({ active: false, draft: '', phase: 'editing', submit: false })
  let state = empty()
  let disposed = false
  const listeners = new Set<() => void>()
  const publish = (next: PreparationState): void => {
    state = next
    if (!disposed)
      listeners.forEach(listener => listener())
  }
  const editable = (): boolean => !disposed && state.phase === 'editing'
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    begin(targetId) {
      if (!editable())
        return
      publish({
        ...state,
        active: true,
        ...state.workspaceId
          ? targetId !== state.targetId ? { error: '当前草稿已确定工作区，不能直接改选。请先处理或丢弃当前草稿。' } : {}
          : { targetId, error: undefined },
      })
    },
    resume() {
      if (editable())
        publish({ ...state, active: true })
    },
    suspend() {
      if (!disposed)
        publish({ ...state, active: false, phase: state.phase === 'handoff' ? 'editing' : state.phase })
    },
    discard() {
      if (editable())
        publish({ ...empty(), active: state.active })
    },
    setDraft(draft) {
      if (editable())
        publish({ ...state, draft })
    },
    setTarget(targetId) {
      if (editable() && !state.workspaceId)
        publish({ ...state, targetId, error: undefined })
    },
    async connect(submit) {
      if (!editable() || !state.active || (submit && !state.draft.trim()))
        return
      publish({ ...state, phase: 'connecting', submit, error: undefined, creationId: state.creationId ?? crypto.randomUUID() })
      try {
        const workspaceId = state.workspaceId ?? state.targetId ?? await port.allocate(state.creationId!)
        if (disposed)
          return
        publish({ ...state, workspaceId })
        const sessionId = state.sessionId ?? await port.connect(workspaceId)
        if (disposed)
          return
        if (!state.active) {
          publish({ ...state, sessionId, phase: 'editing' })
          return
        }
        // 先恢复官方视图，等输入区挂载及草稿恢复完成后再交接
        publish({ ...state, sessionId, phase: 'handoff' })
        port.open(sessionId)
      }
      catch (cause) {
        if (!disposed)
          publish({ ...state, phase: 'editing', error: cause instanceof Error ? cause.message : String(cause) })
      }
    },
    deliver(sessionId) {
      if (disposed || state.phase !== 'handoff' || state.sessionId !== sessionId)
        return
      try {
        port.transfer(sessionId, state.draft, state.submit)
        publish(empty())
      }
      catch (cause) {
        publish({ ...state, phase: 'editing', error: cause instanceof Error ? cause.message : String(cause) })
      }
    },
    failHandoff(message) {
      if (!disposed && state.phase === 'handoff')
        publish({ ...state, phase: 'editing', error: message })
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
