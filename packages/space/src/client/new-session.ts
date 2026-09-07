import type { DraftSession } from './draft-session.ts'
import type { SessionService, WorkspaceService } from './types.ts'
import { fetchRegistry } from './api.ts'

/** 通用新建沿用当前编辑目标；显式工作区不参与推断，描述读取失败时保留当前位置 */
export function createNewSessionAction(
  draft: Pick<DraftSession, 'begin' | 'subscribe' | 'getSnapshot'>,
  sessions: Pick<SessionService, 'list'>,
  workspaces: Pick<WorkspaceService, 'list'>,
  notify: (message: string) => void,
): { begin: (workspaceId?: string, groupId?: string) => void, dispose: () => void } {
  let disposed = false
  let request: AbortController | undefined
  let selected = sessions.list.getSnapshot().current
  const cancel = (): void => {
    request?.abort()
    request = undefined
  }
  let previousDraft = draft.getSnapshot()
  const offDraft = draft.subscribe(() => {
    const state = draft.getSnapshot()
    if (state.active || state.targetId !== previousDraft.targetId || state.phase !== previousDraft.phase)
      cancel()
    previousDraft = state
  })
  const offSelection = sessions.list.subscribe(() => {
    const current = sessions.list.getSnapshot().current
    if (current !== selected)
      cancel()
    selected = current
  })

  return {
    begin(workspaceId, groupId) {
      cancel()
      const start = (id?: string): void => groupId === undefined ? draft.begin(id) : draft.begin(id, groupId)
      if (disposed || draft.getSnapshot().phase === 'creating')
        return
      if (workspaceId !== undefined) {
        start(workspaceId)
        return
      }
      const current = sessions.list.getSnapshot().current
      const state = draft.getSnapshot()
      if (current === undefined) {
        start(state.active ? state.targetId : undefined)
        return
      }
      const core = workspaces.list.getSnapshot()
      if (core.phase !== 'ready') {
        notify('正在读取会话所属工作区，请稍后重试')
        return
      }
      const owner = core.items.find(item => item.sessionIds.includes(current))
      if (!owner) {
        start()
        return
      }
      // 核心列表决定归属，附加描述只用于区分项目与独立对话的存储工作区
      const pending = new AbortController()
      request = pending
      void fetchRegistry(AbortSignal.any([pending.signal, AbortSignal.timeout(5000)])).then((registry) => {
        if (disposed || request !== pending)
          return
        const latest = workspaces.list.getSnapshot()
        if (latest.phase !== 'ready' || latest.items.find(item => item.sessionIds.includes(current))?.workspaceId !== owner.workspaceId) {
          notify('会话所属工作区已变化，请重新新建会话')
          return
        }
        const description = registry.items.find(item => item.workspaceId === owner.workspaceId)
        start(description?.kind === 'chat' ? undefined : owner.workspaceId)
      }).catch((cause: unknown) => {
        if (!disposed && request === pending)
          notify(`无法确认新会话的工作区，请重试：${cause instanceof Error ? cause.message : String(cause)}`)
      }).finally(() => {
        if (request === pending)
          request = undefined
      })
    },
    dispose() {
      disposed = true
      cancel()
      offDraft()
      offSelection()
    },
  }
}
