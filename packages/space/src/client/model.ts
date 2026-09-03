import type { CoreWorkspace, RegistryItem, RegistryPayload, SessionRow, SessionSearchResult, SessionSnapshot, WorkspaceSnapshot } from './types.ts'

export interface SessionView extends SessionRow {
  runningSubagentCount: number
}

export interface SessionBuckets {
  rows: Map<string, SessionView[]>
  misc: SessionView[]
}

/** 以客户端核心列表为基线，叠加服务端返回的 Space 和 Chat 描述 */
export function projectRegistry(registry: RegistryPayload | undefined, workspaces: WorkspaceSnapshot): RegistryItem[] {
  if (workspaces.phase !== 'ready')
    return []
  const described = new Map(
    (registry?.items ?? [])
      .filter(item => item.kind !== 'plain')
      .map(item => [item.workspaceId, item]),
  )
  return workspaces.items.map((workspace) => {
    const description = described.get(workspace.workspaceId)
    if (!description)
      return { kind: 'plain', ...workspace }
    return {
      ...description,
      path: workspace.path,
      title: workspace.title,
      sessionIds: [...workspace.sessionIds],
    }
  })
}

export function groupSessions(items: RegistryItem[], sessions: SessionSnapshot, workspaces: WorkspaceSnapshot): SessionBuckets {
  const rows = new Map(items.map(item => [item.workspaceId, [] as SessionView[]]))
  if (workspaces.phase !== 'ready' || sessions.phase !== 'ready')
    return { rows, misc: [] }

  const owners = new Map<string, string>()
  const core = new Map(workspaces.items.map(item => [item.workspaceId, item]))
  const archived = new Set(workspaces.archivedSessionIds)
  for (const item of items) {
    const workspace = core.get(item.workspaceId)
    if (!workspace)
      continue
    for (const id of workspace.sessionIds) {
      if (!owners.has(id))
        owners.set(id, item.workspaceId)
    }
  }

  const runningChildren = new Map<string, number>()
  for (const id of sessions.ids) {
    const session = sessions.byId[id]
    if (session?.origin === 'subagent' && session.parentId && session.running)
      runningChildren.set(session.parentId, (runningChildren.get(session.parentId) ?? 0) + 1)
  }

  const misc: SessionView[] = []
  for (const id of sessions.ids) {
    const session = sessions.byId[id]
    if (!session || session.origin === 'subagent' || archived.has(id) || (session.blank && sessions.current !== id))
      continue
    const row = { ...session, runningSubagentCount: runningChildren.get(id) ?? 0 }
    const owner = owners.get(id)
    if (!owner || !rows.has(owner)) {
      misc.push(row)
      continue
    }
    rows.get(owner)!.push(row)
  }

  for (const item of items) {
    const order = new Map((core.get(item.workspaceId)?.sessionIds ?? []).map((id, index) => [id, index]))
    rows.get(item.workspaceId)?.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
  }
  return { rows, misc }
}

export interface SearchRow extends SessionView {
  workspaceTitle: string
  snippet?: string
}

export function searchRows(
  query: string,
  items: RegistryItem[],
  sessions: SessionSnapshot,
  archivedSessionIds: string[],
  remote: { items: SessionSearchResult[], hasMore: boolean },
  limit: number,
): { items: SearchRow[], hasMore: boolean } {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle)
    return { items: [], hasMore: false }
  const archived = new Set(archivedSessionIds)
  const workspaceBySession = new Map<string, RegistryItem>()
  for (const item of items) {
    for (const id of item.sessionIds)
      workspaceBySession.set(id, item)
  }
  const remoteById = new Map(remote.items.map(item => [item.sessionId, item.snippet]))
  const ids: string[] = []
  for (const id of sessions.ids) {
    const session = sessions.byId[id]
    const workspace = workspaceBySession.get(id)
    if (!session || session.origin === 'subagent' || archived.has(id) || (session.blank && sessions.current !== id))
      continue
    if (session.displayTitle.toLocaleLowerCase().includes(needle) || workspace?.title.toLocaleLowerCase().includes(needle))
      ids.push(id)
  }
  for (const result of remote.items) {
    if (!ids.includes(result.sessionId))
      ids.push(result.sessionId)
  }
  const result = ids.flatMap((id): SearchRow[] => {
    const session = sessions.byId[id]
    if (!session || session.origin === 'subagent' || archived.has(id) || (session.blank && sessions.current !== id))
      return []
    return [{
      ...session,
      runningSubagentCount: 0,
      workspaceTitle: workspaceBySession.get(id)?.title ?? '未归组',
      ...(remoteById.has(id) ? { snippet: remoteById.get(id) } : {}),
    }]
  })
  return { items: result.slice(0, limit), hasMore: remote.hasMore || result.length > limit }
}

export function moveAnchor<T extends { workspaceId: string }>(items: T[], workspaceId: string, direction: -1 | 1): string | undefined | null {
  const index = items.findIndex(item => item.workspaceId === workspaceId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= items.length)
    return null
  return direction < 0 ? items[target]!.workspaceId : items[target + 1]?.workspaceId
}

export function sessionMoveAnchor(workspace: CoreWorkspace, sessionId: string, direction: -1 | 1): string | undefined | null {
  const index = workspace.sessionIds.indexOf(sessionId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= workspace.sessionIds.length)
    return null
  return direction < 0 ? workspace.sessionIds[target] : workspace.sessionIds[target + 1]
}
