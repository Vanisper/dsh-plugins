import type { DisplayGroup, SidebarLayout } from './layout.ts'
import type { SessionBuckets, SessionView } from './model.ts'
import type { RegistryItem, SessionSnapshot, WorkspaceSnapshot } from './types.ts'

export interface SessionEntry {
  session: SessionView
  item?: RegistryItem
}

/** 只重排展示快照，手动顺序始终留在核心 Workspace 中 */
export function sortWorkspaces(items: RegistryItem[], buckets: SessionBuckets, sort: SidebarLayout['workspaceSort']): { items: RegistryItem[], buckets: SessionBuckets } {
  if (sort === 'manual')
    return { items, buckets }
  const latest = new Map([...buckets.rows].map(([id, rows]) => [id, rows.reduce((latest, row) => Math.max(latest, row.updatedAt), 0)]))
  return {
    items: [...items].sort((a, b) => (latest.get(b.workspaceId) ?? 0) - (latest.get(a.workspaceId) ?? 0)),
    buckets: { rows: new Map([...buckets.rows].map(([id, rows]) => [id, [...rows].sort((a, b) => b.updatedAt - a.updatedAt)])), misc: buckets.misc },
  }
}

export function sortSessions(entries: SessionEntry[], sort: SidebarLayout['sessionSort']): SessionEntry[] {
  return [...entries].sort((a, b) => (sort === 'title' ? a.session.displayTitle.localeCompare(b.session.displayTitle, 'zh-CN') : b.session.updatedAt - a.session.updatedAt) || a.session.id.localeCompare(b.session.id))
}

/** 分组只是单值标记；置顶会话只展示一次，置顶工作区不隐藏其平铺会话 */
export function projectGroups(items: RegistryItem[], buckets: SessionBuckets, layout: SidebarLayout): { pinned: SessionEntry[], groups: Array<{ group: DisplayGroup, entries: SessionEntry[] }>, ungrouped: SessionEntry[] } {
  const byId = new Map<string, SessionEntry>()
  for (const item of items) {
    for (const session of buckets.rows.get(item.workspaceId) ?? [])
      byId.set(session.id, { session, item })
  }
  for (const session of buckets.misc)
    byId.set(session.id, { session })
  const pinned = layout.pins.flatMap((pin) => {
    const entry = pin.kind === 'session' ? byId.get(pin.id) : undefined
    if (!entry)
      return []
    byId.delete(pin.id)
    return [entry]
  })
  const entries = sortSessions([...byId.values()], layout.sessionSort)
  const groups = layout.groups.map(group => ({ group, entries: entries.filter(entry => layout.assignments[entry.session.id] === group.id) }))
  const ids = new Set(layout.groups.map(group => group.id))
  return { pinned, groups, ungrouped: entries.filter(entry => !ids.has(layout.assignments[entry.session.id]!)) }
}

/** 归档列表以核心归档集合为准，缺失摘要单独报告 */
export function archivedEntries(items: RegistryItem[], sessions: SessionSnapshot, workspaces: WorkspaceSnapshot, query: string, sort: SidebarLayout['sessionSort']): { entries: SessionEntry[], missing: number } {
  if (sessions.phase !== 'ready' || workspaces.phase !== 'ready')
    return { entries: [], missing: 0 }
  const owners = new Map(items.flatMap(item => item.sessionIds.map(id => [id, item] as const)))
  let missing = 0
  const needle = query.trim().toLocaleLowerCase()
  const entries = [...new Set(workspaces.archivedSessionIds)].flatMap((id) => {
    const session = sessions.byId[id]
    if (!session) {
      missing++
      return []
    }
    const item = owners.get(id)
    if (needle && !`${session.displayTitle}\n${item?.title ?? ''}`.toLocaleLowerCase().includes(needle))
      return []
    return [{ session: { ...session, runningSubagentCount: 0 }, item }]
  })
  return { entries: sortSessions(entries, sort), missing }
}
