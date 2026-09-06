import type { SessionBuckets, SessionView } from './model.ts'
import type { RegistryItem } from './types.ts'

export const SECTION_IDS = ['pinned', 'chats', 'workspaces'] as const
export type SectionId = typeof SECTION_IDS[number]
export interface Pin {
  kind: 'workspace' | 'session'
  id: string
}
export interface SidebarLayout {
  pins: Pin[]
  sections: SectionId[]
  collapsed: SectionId[]
}
export interface LayoutStore {
  getSnapshot: () => SidebarLayout
  subscribe: (listener: () => void) => () => void
  setPinned: (pin: Pin, pinned: boolean) => void
  setCollapsed: (section: SectionId, collapsed: boolean) => void
  moveSection: (section: SectionId, before?: SectionId) => void
  movePin: (pin: Pin, before?: Pin) => void
}
export type LayoutEntry
  = | { kind: 'workspace', item: RegistryItem, rows: SessionView[] }
    | { kind: 'session', session: SessionView, item?: RegistryItem }

const STORAGE_KEY = 'dsh-space.sidebar.layout'
const defaults = (): SidebarLayout => ({ pins: [], sections: [...SECTION_IDS], collapsed: [] })
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
    return { pins, sections: [...new Set([...sections, ...SECTION_IDS])], collapsed: [...new Set(collapsed)] }
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
