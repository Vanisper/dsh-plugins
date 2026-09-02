import type { RegistryPayload, SessionRow, WorkspaceRow } from './types.ts'

export interface SessionListSnapshot {
  ids: string[]
  byId: Record<string, SessionRow>
  current?: string
}

export interface WorkspaceListSnapshot {
  items: WorkspaceRow[]
  archivedSessionIds: string[]
  phase: 'pending' | 'ready'
}

export type BindingState = 'pending' | 'ready' | 'dangling' | 'mismatch'

export interface SessionBuckets {
  spaceRows: Map<string, SessionRow[]>
  chatRows: Map<string, SessionRow[]>
  misc: SessionRow[]
}

/** 核心工作区基线未到达时不能把“暂时查不到”误判为悬空 */
export function bindingState(workspaceId: string, expectedPath: string, workspaces: WorkspaceListSnapshot): BindingState {
  if (workspaces.phase === 'pending')
    return 'pending'
  const workspace = workspaces.items.find(item => item.workspaceId === workspaceId)
  if (!workspace)
    return 'dangling'
  return workspace.path === expectedPath ? 'ready' : 'mismatch'
}

/**
 * 按核心 workspace 的 sessionIds 分桶
 *
 * @description 插件注册表不推断会话归属；同一会话异常出现在多条核心账目时，
 * 工作区按注册表顺序优先于对话，保证结果稳定且不重复展示
 */
export function groupSessions(registry: Pick<RegistryPayload, 'spaces' | 'chats'>, sessions: SessionListSnapshot, workspaces: WorkspaceListSnapshot): SessionBuckets {
  const archived = new Set(workspaces.archivedSessionIds)
  const spaceRows = new Map(registry.spaces.map(space => [space.id, [] as SessionRow[]]))
  const chatRows = new Map(registry.chats.map(chat => [chat.path, [] as SessionRow[]]))
  const ownerBySession = new Map<string, { kind: 'space' | 'chat', key: string }>()
  const workspaceById = new Map(workspaces.items.map(item => [item.workspaceId, item]))

  for (const space of registry.spaces) {
    const workspace = workspaceById.get(space.workspaceId)
    if (!workspace || workspace.path !== space.shell)
      continue
    for (const sessionId of workspace.sessionIds) {
      if (!ownerBySession.has(sessionId))
        ownerBySession.set(sessionId, { kind: 'space', key: space.id })
    }
  }
  for (const chat of registry.chats) {
    const workspace = workspaceById.get(chat.workspaceId)
    if (!workspace || workspace.path !== chat.path)
      continue
    for (const sessionId of workspace.sessionIds) {
      if (!ownerBySession.has(sessionId))
        ownerBySession.set(sessionId, { kind: 'chat', key: chat.path })
    }
  }

  const misc: SessionRow[] = []
  for (const sessionId of sessions.ids) {
    const session = sessions.byId[sessionId]
    if (!session || session.blank || session.origin === 'subagent' || archived.has(session.id))
      continue
    const owner = ownerBySession.get(session.id)
    if (!owner) {
      misc.push(session)
      continue
    }
    const rows = owner.kind === 'space' ? spaceRows.get(owner.key) : chatRows.get(owner.key)
    if (rows)
      rows.push(session)
    else
      misc.push(session)
  }

  for (const rows of [...spaceRows.values(), ...chatRows.values()])
    rows.sort((left, right) => right.updatedAt - left.updatedAt)
  misc.sort((left, right) => right.updatedAt - left.updatedAt)
  return { spaceRows, chatRows, misc }
}
