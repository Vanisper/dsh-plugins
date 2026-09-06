import type { SessionBuckets, SessionView } from './model.ts'
import type { RegistryItem } from './types.ts'

export const SECTION_IDS = ['pinned', 'chats', 'workspaces'] as const
export type SectionId = typeof SECTION_IDS[number]
export interface Pin {
  kind: 'workspace' | 'session'
  id: string
}
export const GROUP_COLORS = { gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色' } as const
export type GroupColor = keyof typeof GROUP_COLORS
export type SidebarView = 'workspaces' | 'groups'
export interface DisplayGroup {
  id: string
  title: string
  color: GroupColor
  collapsed: boolean
}
export interface SidebarLayout {
  pins: Pin[]
  sections: SectionId[]
  collapsed: SectionId[]
  view: SidebarView
  workspaceSort: 'manual' | 'updated'
  sessionSort: 'updated' | 'title'
  groups: DisplayGroup[]
  assignments: Record<string, string>
}
export interface LayoutStore {
  getSnapshot: () => SidebarLayout
  subscribe: (listener: () => void) => () => void
  setPinned: (pin: Pin, pinned: boolean) => void
  setCollapsed: (section: SectionId, collapsed: boolean) => void
  moveSection: (section: SectionId, before?: SectionId) => void
  movePin: (pin: Pin, before?: Pin) => void
  setView: (view: SidebarView) => void
  setSort: (sort: Partial<Pick<SidebarLayout, 'workspaceSort' | 'sessionSort'>>) => void
  saveGroup: (group: DisplayGroup, create?: boolean) => void
  deleteGroup: (id: string) => void
  assignGroup: (sessionId: string, groupId?: string) => void
  moveGroup: (id: string, before?: string) => void
}
export type LayoutEntry
  = | { kind: 'workspace', item: RegistryItem, rows: SessionView[] }
    | { kind: 'session', session: SessionView, item?: RegistryItem }

const STORAGE_KEY = 'dsh-space.sidebar.layout'
const defaults = (): SidebarLayout => ({ pins: [], sections: [...SECTION_IDS], collapsed: [], view: 'workspaces', workspaceSort: 'manual', sessionSort: 'updated', groups: [], assignments: {} })
const samePin = (a: Pin, b: Pin): boolean => a.kind === b.kind && a.id === b.id
const isSection = (value: unknown): value is SectionId => SECTION_IDS.includes(value as SectionId)

function decode(raw: string | null): SidebarLayout {
  try {
    const data = JSON.parse(raw ?? 'null')
    if (!data || typeof data !== 'object')
      return defaults()
    const pins: Pin[] = []
    for (const pin of Array.isArray(data.pins) ? data.pins : []) {
      if (pin && (pin.kind === 'workspace' || pin.kind === 'session') && typeof pin.id === 'string' && pin.id && !pins.some(value => samePin(value, pin)))
        pins.push({ kind: pin.kind, id: pin.id })
    }
    const sections = (Array.isArray(data.sections) ? data.sections : []).filter(isSection) as SectionId[]
    const collapsed = (Array.isArray(data.collapsed) ? data.collapsed : []).filter(isSection) as SectionId[]
    const groups: DisplayGroup[] = []
    for (const group of Array.isArray(data.groups) ? data.groups : []) {
      if (group && typeof group.id === 'string' && group.id && typeof group.title === 'string' && group.title.trim() && !groups.some(value => value.id === group.id)) {
        groups.push({ id: group.id, title: group.title.trim().slice(0, 80), color: Object.hasOwn(GROUP_COLORS, group.color) ? group.color : 'gray', collapsed: group.collapsed === true })
      }
    }
    const assignments = Object.fromEntries(Object.entries(data.assignments && typeof data.assignments === 'object' && !Array.isArray(data.assignments) ? data.assignments : {}).filter(([id, groupId]) => id && groups.some(group => group.id === groupId))) as Record<string, string>
    return {
      pins,
      sections: [...new Set([...sections, ...SECTION_IDS])],
      collapsed: [...new Set(collapsed)],
      groups,
      assignments,
      view: data.view === 'groups' ? 'groups' : 'workspaces',
      workspaceSort: data.workspaceSort === 'updated' ? 'updated' : 'manual',
      sessionSort: data.sessionSort === 'title' ? 'title' : 'updated',
    }
  }
  catch {
    return defaults()
  }
}

/** 只保存展示引用，不写入核心工作区及会话顺序 */
export function createLayoutStore(): LayoutStore {
  let snapshot = defaults()
  let memoryOnly = false
  const listeners = new Set<() => void>()
  const read = (): SidebarLayout => {
    try {
      return decode(localStorage.getItem(STORAGE_KEY))
    }
    catch {
      return snapshot
    }
  }
  snapshot = read()
  const publish = (next: SidebarLayout): void => {
    if (JSON.stringify(next) === JSON.stringify(snapshot))
      return
    snapshot = next
    listeners.forEach(listener => listener())
  }
  const sync = (event: StorageEvent): void => {
    if (!memoryOnly && (event.key === STORAGE_KEY || event.key === null))
      publish(read())
  }
  const change = (update: (value: SidebarLayout) => SidebarLayout): void => {
    const next = update(memoryOnly ? snapshot : read())
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
    catch {
      memoryOnly = true
    }
    publish(next)
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      if (!listeners.size) {
        if (!memoryOnly)
          publish(read())
        window.addEventListener('storage', sync)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size)
          window.removeEventListener('storage', sync)
      }
    },
    setPinned(pin: Pin, pinned: boolean): void {
      change(value => ({ ...value, pins: pinned
        ? value.pins.some(item => samePin(item, pin)) ? value.pins : [...value.pins, pin]
        : value.pins.filter(item => !samePin(item, pin)) }))
    },
    setCollapsed(section: SectionId, collapsed: boolean): void {
      change(value => ({ ...value, collapsed: collapsed
        ? [...new Set([...value.collapsed, section])]
        : value.collapsed.filter(id => id !== section) }))
    },
    moveSection(section: SectionId, before?: SectionId): void {
      if (section === before)
        return
      change((value) => {
        const sections = value.sections.filter(id => id !== section)
        sections.splice(before ? sections.indexOf(before) : sections.length, 0, section)
        return { ...value, sections }
      })
    },
    movePin(pin: Pin, before?: Pin): void {
      change((value) => {
        if (!value.pins.some(item => samePin(item, pin)) || (before && samePin(pin, before)))
          return value
        const pins = value.pins.filter(item => !samePin(item, pin))
        const index = before ? pins.findIndex(item => samePin(item, before)) : -1
        pins.splice(index < 0 ? pins.length : index, 0, pin)
        return { ...value, pins }
      })
    },
    setView: view => change(value => ({ ...value, view })),
    setSort: sort => change(value => ({ ...value, ...sort })),
    saveGroup(group, create = false): void {
      change((value) => {
        const exists = value.groups.some(item => item.id === group.id)
        if (!create && !exists)
          throw new Error('分组已被移除，请关闭后重新检查')
        if (create && exists)
          throw new Error('分组已存在')
        const title = group.title.trim()
        if (!title || title.length > 80)
          throw new Error('分组名称需为 1 至 80 个字符')
        if (!Object.hasOwn(GROUP_COLORS, group.color))
          throw new Error('请选择有效的分组颜色')
        if (value.groups.some(item => item.id !== group.id && item.title === title))
          throw new Error('已有同名分组')
        const next = { ...group, title }
        return { ...value, groups: exists ? value.groups.map(item => item.id === group.id ? next : item) : [...value.groups, next] }
      })
    },
    deleteGroup(id): void {
      change(value => ({ ...value, groups: value.groups.filter(group => group.id !== id), assignments: Object.fromEntries(Object.entries(value.assignments).filter(([, groupId]) => groupId !== id)) }))
    },
    assignGroup(sessionId, groupId): void {
      change((value) => {
        if (groupId && !value.groups.some(group => group.id === groupId))
          throw new Error('目标分组已被移除')
        const assignments = Object.fromEntries(Object.entries(value.assignments).filter(([id]) => id !== sessionId))
        if (groupId)
          Object.defineProperty(assignments, sessionId, { value: groupId, enumerable: true, configurable: true, writable: true })
        return { ...value, assignments }
      })
    },
    moveGroup(id, before): void {
      change((value) => {
        const group = value.groups.find(group => group.id === id)
        if (!group || id === before)
          return value
        const groups = value.groups.filter(group => group.id !== id)
        const index = groups.findIndex(group => group.id === before)
        groups.splice(index < 0 ? groups.length : index, 0, group)
        return { ...value, groups }
      })
    },
  }
}

/** 从已过滤的核心分组生成唯一展示位置，过期置顶引用不产生条目 */
export function projectLayout(items: RegistryItem[], buckets: SessionBuckets, pins: Pin[]): Record<SectionId, LayoutEntry[]> {
  const sessions = new Map<string, Extract<LayoutEntry, { kind: 'session' }>>()
  for (const item of items) {
    for (const session of buckets.rows.get(item.workspaceId) ?? [])
      sessions.set(session.id, { kind: 'session', session, item })
  }
  for (const session of buckets.misc)
    sessions.set(session.id, { kind: 'session', session })
  const pinnedSessions = new Set(pins.filter(pin => pin.kind === 'session').map(pin => pin.id))
  const workspaces = new Map(items.filter(item => item.kind !== 'chat').map(item => [item.workspaceId, {
    kind: 'workspace' as const,
    item,
    rows: (buckets.rows.get(item.workspaceId) ?? []).filter(row => !pinnedSessions.has(row.id)),
  }]))
  const result: Record<SectionId, LayoutEntry[]> = { pinned: [], chats: [], workspaces: [] }
  for (const pin of pins) {
    const entry = pin.kind === 'workspace' ? workspaces.get(pin.id) : sessions.get(pin.id)
    if (!entry)
      continue
    result.pinned.push(entry)
    if (pin.kind === 'workspace')
      workspaces.delete(pin.id)
    else
      sessions.delete(pin.id)
  }
  result.workspaces = [...workspaces.values()]
  result.chats = [...sessions.values()].filter(entry => entry.item?.kind === 'chat').sort((a, b) => b.session.updatedAt - a.session.updatedAt)
  return result
}

/** 限量时仍保留当前条目，且不改变它在列表中的相对位置 */
export function visibleEntries<T>(items: T[], expanded: boolean, isCurrent: (item: T) => boolean, limit = 5): T[] {
  return expanded ? items : items.filter((item, index) => index < limit || isCurrent(item))
}
