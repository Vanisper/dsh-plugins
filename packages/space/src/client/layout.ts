import type { SessionBuckets, SessionView } from './model.ts'
import type { RegistryItem } from './types.ts'
import { moveBefore } from './session-order.ts'

export const SECTION_IDS = ['pinned', 'chats', 'workspaces', 'misc'] as const
export type SectionId = typeof SECTION_IDS[number]
export type FlatSectionId = 'chats' | 'misc'
export interface Pin {
  kind: 'workspace' | 'session'
  id: string
}
export const GROUP_COLORS = { gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色' } as const
export type GroupColor = keyof typeof GROUP_COLORS
export type SidebarView = 'workspaces' | 'groups'
export type SortMode = 'updated' | 'manual'
export type ListKey = `project:${SectionId}` | 'groups:pinned' | 'groups:sessions' | `group:${string}`
export const projectKey = (section: SectionId): ListKey => `project:${section}`
export const groupKey = (id?: string): ListKey => id ? `group:${id}` : 'groups:sessions'
export const pinKey = (pin: Pin): string => `${pin.kind}:${pin.id}`
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
  /** 按视图与大组隔离；项目行仍沿用核心手动顺序 */
  sorts: Partial<Record<ListKey, SortMode>>
  orders: Partial<Record<ListKey, string[]>>
  foldedLists: ListKey[]
  groups: DisplayGroup[]
  assignments: Record<string, string>
}
export interface LayoutStore {
  getSnapshot: () => SidebarLayout
  subscribe: (listener: () => void) => () => void
  setPinned: (pin: Pin, pinned: boolean) => void
  setCollapsed: (section: SectionId, collapsed: boolean) => void
  moveSection: (section: SectionId, before?: SectionId) => void
  movePin: (pin: Pin, before?: Pin, view?: SidebarView, order?: Pin[]) => void
  setView: (view: SidebarView) => void
  setListSort: (key: ListKey, sort: SortMode) => void
  setListCollapsed: (key: ListKey, collapsed: boolean) => void
  saveGroup: (group: DisplayGroup, create?: boolean, expected?: DisplayGroup) => void
  setGroupCollapsed: (id: string, collapsed: boolean) => void
  deleteGroup: (id: string) => void
  assignGroup: (sessionId: string, groupId?: string, ifPresent?: boolean) => void
  moveGroup: (id: string, before?: string) => void
  moveGroupSession: (input: { id: string, before?: string, groupId?: string, order: string[] }) => void
  moveFlatSession: (input: { section: FlatSectionId, id: string, before?: string, order: string[] }) => void
}
export type LayoutEntry
  = | { kind: 'workspace', item: RegistryItem, rows: SessionView[] }
    | { kind: 'session', session: SessionView, item?: RegistryItem }

const STORAGE_KEY = 'dsh-space.sidebar.layout'
const defaults = (): SidebarLayout => ({ pins: [], sections: [...SECTION_IDS], collapsed: [], view: 'workspaces', sorts: {}, orders: {}, foldedLists: [], groups: [], assignments: {} })
const samePin = (a: Pin, b: Pin): boolean => a.kind === b.kind && a.id === b.id
const isSection = (value: unknown): value is SectionId => SECTION_IDS.includes(value as SectionId)
const decodeOrder = (value: unknown): string[] => [...new Set((Array.isArray(value) ? value : []).filter((id): id is string => typeof id === 'string' && !!id))]
const isListKey = (key: string): key is ListKey => SECTION_IDS.some(id => key === projectKey(id)) || key === 'groups:pinned' || key === 'groups:sessions' || (key.startsWith('group:') && key.length > 6)
export const listSort = (layout: Pick<SidebarLayout, 'sorts'>, key: ListKey): SortMode => layout.sorts[key] ?? 'updated'

/** 手动模式保留已知顺序，新条目按更新时间补在后面 */
export function sortList<T>(rows: T[], layout: Pick<SidebarLayout, 'sorts' | 'orders'>, key: ListKey, id: (row: T) => string, updated: (row: T) => number): T[] {
  const order = new Map((listSort(layout, key) === 'manual' ? layout.orders[key] ?? [] : []).map((id, index) => [id, index]))
  return [...rows].sort((a, b) => (order.get(id(a)) ?? Infinity) - (order.get(id(b)) ?? Infinity) || updated(b) - updated(a))
}

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
    const sorts: SidebarLayout['sorts'] = {}
    const orders: SidebarLayout['orders'] = {}
    // 旧共享偏好只在迁移时复制，之后各组独立写入
    if (!data.sorts) {
      for (const section of SECTION_IDS)
        sorts[projectKey(section)] = section === 'pinned' ? 'manual' : data.workspaceSort === 'manual' ? 'manual' : 'updated'
      for (const key of ['groups:sessions', ...groups.map(group => groupKey(group.id))] as ListKey[])
        sorts[key] = data.sessionSort === 'manual' ? 'manual' : 'updated'
      sorts['groups:pinned'] = 'manual'
      orders['project:pinned'] = pins.map(pinKey)
      orders['groups:pinned'] = pins.filter(pin => pin.kind === 'session').map(pinKey)
      orders['project:chats'] = decodeOrder(data.flatSessionOrder?.chats)
      orders['project:misc'] = decodeOrder(data.flatSessionOrder?.misc)
      for (const key of ['groups:sessions', ...groups.map(group => groupKey(group.id))] as ListKey[])
        orders[key] = decodeOrder(data.groupSessionOrder).filter(id => groupKey(assignments[id]) === key)
    }
    else {
      for (const [key, value] of Object.entries(data.sorts)) {
        if (isListKey(key) && (value === 'manual' || value === 'updated'))
          sorts[key] = value
      }
      for (const [key, value] of Object.entries(data.orders ?? {})) {
        if (isListKey(key))
          orders[key] = decodeOrder(value)
      }
    }
    return {
      pins,
      sections: [...new Set([...sections, ...SECTION_IDS])],
      collapsed: [...new Set(collapsed)],
      groups,
      assignments,
      view: data.view === 'groups' ? 'groups' : 'workspaces',
      sorts,
      orders,
      foldedLists: decodeOrder(data.foldedLists).filter(isListKey),
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
    movePin(pin: Pin, before?: Pin, view = 'workspaces', order?: Pin[]): void {
      change((value) => {
        if (!value.pins.some(item => samePin(item, pin)) || (before && samePin(pin, before)))
          return value
        const key: ListKey = view === 'groups' ? 'groups:pinned' : 'project:pinned'
        const ids = (order ?? value.pins).map(pinKey)
        const next = moveBefore(ids, pinKey(pin), before ? pinKey(before) : undefined)
        if (next.every((id, index) => id === ids[index]))
          return value
        return { ...value, orders: { ...value.orders, [key]: next }, sorts: pin.kind === 'session' ? { ...value.sorts, [key]: 'manual' } : value.sorts }
      })
    },
    setView: view => change(value => ({ ...value, view })),
    setListSort: (key, sort) => change(value => ({ ...value, sorts: { ...value.sorts, [key]: sort } })),
    setListCollapsed: (key, collapsed) => change(value => ({ ...value, foldedLists: collapsed ? [...new Set([...value.foldedLists, key])] : value.foldedLists.filter(id => id !== key) })),
    saveGroup(group, create = false, expected): void {
      change((value) => {
        const exists = value.groups.some(item => item.id === group.id)
        if (!create && !exists)
          throw new Error('分组已被移除，请关闭后重新检查')
        if (create && exists)
          throw new Error('分组已存在')
        const current = value.groups.find(item => item.id === group.id)
        if (expected && current && (current.title !== expected.title || current.color !== expected.color))
          throw new Error('分组已在其他页面变更，请取消后重新编辑')
        const title = group.title.trim()
        if (!title || title.length > 80)
          throw new Error('分组名称需为 1 至 80 个字符')
        if (!Object.hasOwn(GROUP_COLORS, group.color))
          throw new Error('请选择有效的分组颜色')
        if (value.groups.some(item => item.id !== group.id && item.title === title))
          throw new Error('已有同名分组')
        const next = { ...group, title, collapsed: current?.collapsed ?? group.collapsed }
        return { ...value, groups: exists ? value.groups.map(item => item.id === group.id ? next : item) : [...value.groups, next] }
      })
    },
    setGroupCollapsed: (id, collapsed) => change(value => ({ ...value, groups: value.groups.map(group => group.id === id ? { ...group, collapsed } : group) })),
    deleteGroup(id): void {
      change(value => ({ ...value, groups: value.groups.filter(group => group.id !== id), assignments: Object.fromEntries(Object.entries(value.assignments).filter(([, groupId]) => groupId !== id)) }))
    },
    assignGroup(sessionId, groupId, ifPresent): void {
      change((value) => {
        if (groupId && !value.groups.some(group => group.id === groupId)) {
          if (ifPresent)
            return value
          throw new Error('目标分组已被移除')
        }
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
    moveGroupSession({ id, before, groupId, order }): void {
      change((value) => {
        if (id === before || (before && !order.includes(before)))
          return value
        if (groupId && !value.groups.some(group => group.id === groupId))
          throw new Error('目标分组已被移除')
        const assignments = { ...value.assignments }
        delete assignments[id]
        if (groupId)
          Object.defineProperty(assignments, id, { value: groupId, enumerable: true, configurable: true, writable: true })
        const key = groupKey(groupId)
        const next = moveBefore(order.includes(id) ? order : [...order, id], id, before)
        if (value.assignments[id] === groupId && next.every((id, index) => id === order[index]))
          return value
        return { ...value, assignments, sorts: { ...value.sorts, [key]: 'manual' }, orders: { ...value.orders, [key]: next } }
      })
    },
    moveFlatSession({ section, id, before, order }): void {
      change((value) => {
        if (!order.includes(id) || (before && !order.includes(before)))
          return value
        const next = moveBefore(order, id, before)
        if (next.every((id, index) => id === order[index]))
          return value
        const key = projectKey(section)
        return { ...value, sorts: { ...value.sorts, [key]: 'manual' }, orders: { ...value.orders, [key]: next } }
      })
    },
  }
}

/** 从已过滤的核心分组生成唯一展示位置，过期置顶引用不产生条目 */
export function projectLayout(items: RegistryItem[], buckets: SessionBuckets, pins: Pin[], preferences: Pick<SidebarLayout, 'sorts' | 'orders'> = defaults()): Record<SectionId, LayoutEntry[]> {
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
  const result: Record<SectionId, LayoutEntry[]> = { pinned: [], chats: [], workspaces: [], misc: [] }
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
  for (const section of ['workspaces', 'pinned'] as const) {
    for (const entry of result[section]) {
      if (entry.kind === 'workspace' && listSort(preferences, projectKey(section)) === 'updated')
        entry.rows = [...entry.rows].sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }
  const pinOrder = new Map((preferences.orders['project:pinned'] ?? []).map((id, index) => [id, index]))
  result.pinned.sort((a, b) => (pinOrder.get(a.kind === 'workspace' ? `workspace:${a.item.workspaceId}` : `session:${a.session.id}`) ?? Infinity) - (pinOrder.get(b.kind === 'workspace' ? `workspace:${b.item.workspaceId}` : `session:${b.session.id}`) ?? Infinity))
  const sortedPins = sortList(result.pinned.filter((entry): entry is Extract<LayoutEntry, { kind: 'session' }> => entry.kind === 'session'), preferences, 'project:pinned', entry => `session:${entry.session.id}`, entry => entry.session.updatedAt)
  let pinIndex = 0
  result.pinned = result.pinned.map(entry => entry.kind === 'session' ? sortedPins[pinIndex++]! : entry)
  for (const section of ['chats', 'misc'] as const) {
    result[section] = sortList([...sessions.values()].filter(entry => section === 'chats' ? entry.item?.kind === 'chat' : !entry.item), preferences, projectKey(section), entry => entry.session.id, entry => entry.session.updatedAt)
  }
  return result
}

/** 限量时仍保留当前条目，且不改变它在列表中的相对位置 */
export function visibleEntries<T>(items: T[], expanded: boolean, isCurrent: (item: T) => boolean, limit = 5): T[] {
  return expanded ? items : items.filter((item, index) => index < limit || isCurrent(item))
}
