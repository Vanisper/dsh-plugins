import type { RegistryItem, RegistryPayload, SessionRow, SessionSnapshot, WorkspaceSnapshot } from './types.ts'

export interface SessionBuckets {
  rows: Map<string, SessionRow[]>
  misc: SessionRow[]
}

export function groupSessions(registry: RegistryPayload, sessions: SessionSnapshot, workspaces: WorkspaceSnapshot): SessionBuckets {
  const rows = new Map(registry.items.map(item => [item.workspaceId, [] as SessionRow[]]))
  if (workspaces.phase !== 'ready')
    return { rows, misc: [] }
  const owners = new Map<string, string>()
  const core = new Map(workspaces.items.map(item => [item.workspaceId, item]))
  const archived = new Set(workspaces.archivedSessionIds)
  for (const item of registry.items) {
    const workspace = core.get(item.workspaceId)
    if (!workspace)
      continue
    for (const id of workspace.sessionIds) {
      if (!owners.has(id))
        owners.set(id, item.workspaceId)
    }
  }
  const misc: SessionRow[] = []
  for (const id of sessions.ids) {
    const session = sessions.byId[id]
    if (!session || session.blank || session.origin === 'subagent' || archived.has(id))
      continue
    const owner = owners.get(id)
    if (!owner || !rows.has(owner)) {
      misc.push(session)
      continue
    }
    rows.get(owner)!.push(session)
  }
  for (const item of registry.items) {
    const order = new Map((core.get(item.workspaceId)?.sessionIds ?? []).map((id, index) => [id, index]))
    rows.get(item.workspaceId)?.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
  }
  return { rows, misc }
}

export function orderedRows(item: RegistryItem, _sessions: SessionSnapshot, buckets: SessionBuckets): SessionRow[] {
  return buckets.rows.get(item.workspaceId) ?? []
}
