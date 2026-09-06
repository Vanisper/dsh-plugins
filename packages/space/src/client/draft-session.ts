import type { ObservableSnapshot } from './types.ts'

export interface DraftSessionState {
  active: boolean
  phase: 'editing' | 'creating' | 'created'
  targetId?: string
  workspaceId?: string
  creationId?: string
  requestedSessionId?: string
  sessionId?: string
  error?: string
}

export interface DraftPayload {
  text: string
  imageIds: readonly string[]
}

export interface DraftSessionPort {
  allocate: (creationId: string) => Promise<string>
  create: (workspaceId: string, sessionId: string) => Promise<string>
  /** 接收成功后，内容及发送失败恢复均归真实会话输入区所有 */
  adopt: (sessionId: string, payload: DraftPayload) => Promise<void>
  clearSelection: () => void
}

export interface DraftSession extends ObservableSnapshot<DraftSessionState> {
  begin: (targetId?: string) => void
  setTarget: (targetId?: string) => void
  suspend: () => void
  discard: () => boolean
  submit: (payload: DraftPayload, signal: AbortSignal) => Promise<void>
  dispose: () => void
}

/** 草稿不是 Session；只有首次提交跨越实体创建边界 */
export function createDraftSession(port: DraftSessionPort): DraftSession {
  const empty = (): DraftSessionState => ({ active: false, phase: 'editing' })
  let state = empty()
  let disposed = false
  const listeners = new Set<() => void>()
  const publish = (next: DraftSessionState): void => {
    state = next
    if (!disposed)
      listeners.forEach(listener => listener())
  }
  const editable = (): boolean => !disposed && state.phase !== 'creating'
  const setTarget = (targetId?: string): void => {
    if (!editable())
      return
    if (state.creationId && targetId !== state.targetId) {
      publish({ ...state, error: '创建已开始，重试将使用原目标。请先处理或丢弃当前草稿。' })
      return
    }
    publish({ ...state, targetId, error: undefined })
  }
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
      if (state.phase === 'created')
        state = empty()
      setTarget(targetId)
      publish({ ...state, active: true })
      port.clearSelection()
    },
    setTarget,
    suspend() {
      if (!disposed)
        publish({ ...state, active: false })
    },
    discard() {
      if (!editable())
        return false
      publish({ ...empty(), active: state.active })
      return true
    },
    async submit(payload, signal) {
      if (!editable() || !state.active || (!payload.text.trim() && !payload.imageIds.length))
        throw new Error('草稿当前不能提交')
      publish({
        ...state,
        phase: 'creating',
        error: undefined,
        creationId: state.creationId ?? crypto.randomUUID(),
        requestedSessionId: state.requestedSessionId ?? crypto.randomUUID(),
      })
      const checkActive = (): void => {
        if (disposed || signal.aborted || !state.active)
          throw new Error('已离开新会话，内容尚未发送。返回新会话可继续。')
      }
      try {
        checkActive()
        const workspaceId = state.workspaceId ?? state.targetId ?? await port.allocate(state.creationId!)
        publish({ ...state, workspaceId })
        checkActive()
        const sessionId = state.sessionId ?? await port.create(workspaceId, state.requestedSessionId!)
        // 已创建的身份即使在导航或取消后到达，也不能被当作不存在
        publish({ ...state, sessionId })
        checkActive()
        await port.adopt(sessionId, payload)
        publish({ ...state, active: false, phase: 'created' })
      }
      catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        publish({ ...state, phase: 'editing', error: error.message })
        throw error
      }
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
