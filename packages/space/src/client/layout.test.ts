// @vitest-environment jsdom
import type { RegistryItem } from './types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayoutStore, listSort, projectLayout, visibleEntries } from './layout.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('侧栏展示偏好', () => {
  it('校验持久化输入并补齐分区，未分组默认置底，类型不同的同名 ID 可独立置顶', () => {
    localStorage.setItem('dsh-space.sidebar.layout', JSON.stringify({ sections: ['chats', 'chats', 'other'], pins: [null, { kind: 'session', id: 's' }, { kind: 'session', id: 's' }] }))
    const store = createLayoutStore()
    store.setPinned({ kind: 'workspace', id: 's' }, true)
    expect(store.getSnapshot().sections).toEqual(['chats', 'pinned', 'workspaces', 'misc'])
    expect(store.getSnapshot().pins).toHaveLength(2)
    expect(createLayoutStore().getSnapshot()).toEqual(store.getSnapshot())
  })

  it('大分区排序、折叠和混合置顶顺序互不影响', () => {
    const store = createLayoutStore()
    const workspace = { kind: 'workspace' as const, id: 'w' }
    const session = { kind: 'session' as const, id: 's' }
    store.setPinned(workspace, true)
    store.setPinned(session, true)
    store.movePin(session, workspace)
    store.moveSection('workspaces', 'pinned')
    store.setCollapsed('pinned', true)
    expect(store.getSnapshot()).toMatchObject({ pins: [workspace, session], orders: { 'project:pinned': ['session:s', 'workspace:w'] }, sections: ['workspaces', 'pinned', 'chats', 'misc'], collapsed: ['pinned'] })
    store.setPinned(session, false)
    expect(store.getSnapshot().pins).toEqual([workspace])
  })

  it('同步其他页面并在写入前读取最新偏好，取消订阅后不响应事件', () => {
    const store = createLayoutStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    const other = createLayoutStore()
    other.setPinned({ kind: 'workspace', id: 'w' }, true)
    store.setCollapsed('chats', true)
    expect(store.getSnapshot().pins).toHaveLength(1)
    other.moveSection('chats', 'pinned')
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-space.sidebar.layout' }))
    expect(store.getSnapshot().sections[0]).toBe('chats')
    off()
    listener.mockClear()
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(listener).not.toHaveBeenCalled()
  })

  it('存储损坏或写入受限时仍可连续操作', () => {
    localStorage.setItem('dsh-space.sidebar.layout', 'invalid')
    const store = createLayoutStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    store.setPinned({ kind: 'session', id: 's' }, true)
    store.setCollapsed('pinned', true)
    expect(store.getSnapshot().pins).toHaveLength(1)
    expect(store.getSnapshot().collapsed).toEqual(['pinned'])
  })

  it('兼容旧偏好并过滤失效分组输入', () => {
    localStorage.setItem('dsh-space.sidebar.layout', JSON.stringify({ groups: [null, { id: 'g', title: ' 分组 ', color: 'invalid' }, { id: 'g', title: '重复' }], assignments: { s: 'g', orphan: 'gone' }, view: 'invalid', sessionSort: 'created' }))
    expect(createLayoutStore().getSnapshot()).toMatchObject({ view: 'workspaces', sorts: { 'group:g': 'updated' }, groups: [{ id: 'g', title: '分组', color: 'gray', collapsed: false }], assignments: { s: 'g' } })
  })

  it('每个会话只分配一个分组，删除分组不影响置顶且清理全部标记', () => {
    const store = createLayoutStore()
    store.saveGroup({ id: 'g', title: '一', color: 'blue', collapsed: false }, true)
    store.saveGroup({ id: 'h', title: '二', color: 'green', collapsed: false }, true)
    store.setPinned({ kind: 'session', id: 's' }, true)
    store.assignGroup('s', 'g')
    store.assignGroup('s', 'h')
    store.assignGroup('archived', 'h')
    expect(store.getSnapshot().assignments).toEqual({ s: 'h', archived: 'h' })
    store.moveGroup('h', 'g')
    expect(store.getSnapshot().groups[0]?.id).toBe('h')
    store.deleteGroup('h')
    expect(store.getSnapshot().assignments).toEqual({})
    expect(store.getSnapshot().pins).toHaveLength(1)
    expect(createLayoutStore().getSnapshot()).toEqual(store.getSnapshot())
  })

  it('拒绝空白及重复名称，跨页删除后不复活旧分组', () => {
    const store = createLayoutStore()
    const group = { id: 'g', title: '一', color: 'blue' as const, collapsed: false }
    store.saveGroup(group, true)
    expect(() => store.saveGroup({ ...group, title: ' ' })).toThrow('名称')
    expect(() => store.saveGroup({ ...group, id: 'h' }, true)).toThrow('同名')
    createLayoutStore().deleteGroup('g')
    expect(() => store.saveGroup(group)).toThrow('已被移除')
    expect(() => store.assignGroup('s', 'g')).toThrow('已被移除')
    expect(() => store.assignGroup('new-session', 'g', true)).not.toThrow()
    expect(store.getSnapshot().assignments['new-session']).toBeUndefined()
  })

  it('切换视图和排序不会覆盖其他页面的分组变更', () => {
    const store = createLayoutStore()
    createLayoutStore().saveGroup({ id: 'g', title: '一', color: 'blue', collapsed: false }, true)
    store.setView('groups')
    store.setListSort('group:g', 'manual')
    expect(store.getSnapshot()).toMatchObject({ view: 'groups', sorts: { 'group:g': 'manual' }, groups: [{ id: 'g' }] })
    expect(listSort(store.getSnapshot(), 'project:workspaces')).toBe('updated')
  })

  it('两个视图默认最近更新，旧按标题偏好回退且手动偏好保留', () => {
    expect(createLayoutStore().getSnapshot()).toMatchObject({ sorts: {} })
    localStorage.setItem('dsh-space.sidebar.layout', JSON.stringify({ sessionSort: 'title', workspaceSort: 'manual', groupSessionOrder: ['a', 'a', null, 3, 'b'] }))
    expect(createLayoutStore().getSnapshot()).toMatchObject({ sorts: { 'groups:sessions': 'updated', 'project:workspaces': 'manual' }, orders: { 'groups:sessions': ['a', 'b'] } })
  })

  it('分组手动顺序独立保存，重新载入和切换排序不会改写项目偏好', () => {
    const store = createLayoutStore()
    store.saveGroup({ id: 'g', title: '分组', color: 'gray', collapsed: false }, true)
    store.moveGroupSession({ id: 'c', before: 'a', groupId: 'g', order: ['a', 'b', 'c'] })
    expect(createLayoutStore().getSnapshot()).toMatchObject({ orders: { 'group:g': ['c', 'a', 'b'] }, sorts: { 'group:g': 'manual' }, assignments: { c: 'g' } })
    store.setListSort('group:g', 'updated')
    store.moveGroupSession({ id: 'b', before: 'c', order: ['c', 'a', 'b'] })
    expect(store.getSnapshot().orders['group:g']).toEqual(['c', 'a', 'b'])
    expect(store.getSnapshot().sorts).toMatchObject({ 'group:g': 'updated', 'groups:sessions': 'manual' })
    store.setListSort('group:g', 'manual')
    expect(store.getSnapshot().orders['group:g']).toEqual(['c', 'a', 'b'])
  })

  it('平铺分区顺序各自持久化，无效拖放不切换排序', () => {
    const store = createLayoutStore()
    store.moveFlatSession({ section: 'chats', id: 'a', before: 'x', order: ['a', 'b'] })
    store.moveFlatSession({ section: 'chats', id: 'a', before: 'b', order: ['a', 'b'] })
    expect(listSort(store.getSnapshot(), 'project:chats')).toBe('updated')
    store.moveFlatSession({ section: 'chats', id: 'b', before: 'a', order: ['a', 'b'] })
    store.moveFlatSession({ section: 'misc', id: 'x', order: ['x', 'y'] })
    expect(createLayoutStore().getSnapshot()).toMatchObject({ sorts: { 'project:chats': 'manual', 'project:misc': 'manual' }, orders: { 'project:chats': ['b', 'a'], 'project:misc': ['y', 'x'] } })
    expect(listSort(store.getSnapshot(), 'project:workspaces')).toBe('updated')
    store.moveSection('misc', 'pinned')
    store.setCollapsed('misc', true)
    expect(createLayoutStore().getSnapshot()).toMatchObject({ sections: ['misc', 'pinned', 'chats', 'workspaces'], collapsed: ['misc'] })
  })
})

describe('分区投影', () => {
  const row = (id: string, updatedAt = 1) => ({ id, updatedAt, displayTitle: id, blank: false, running: false, runningSubagentCount: 0 })
  const items: RegistryItem[] = [
    { kind: 'space', workspaceId: 'w', path: '/w', title: 'w', sessionIds: ['a', 'b'] },
    { kind: 'chat', workspaceId: 'c', path: '/c', title: 'c', sessionIds: ['d', 'e'] },
  ]
  const buckets = { rows: new Map([['w', [row('a'), row('b')]], ['c', [row('d'), row('e', 2)]]]), misc: [row('misc')] }

  it('项目大组共享会话排序，但不影响置顶项目、对话及项目行自身顺序', () => {
    const store = createLayoutStore()
    const extra: RegistryItem = { ...items[0]!, workspaceId: 'w2', sessionIds: ['f', 'g'] }
    const input = { rows: new Map([...buckets.rows, ['w', [row('a', 1), row('b', 9)]], ['w2', [row('f', 1), row('g', 10)]]] as [string, ReturnType<typeof row>[]][]), misc: buckets.misc }
    const projectIds = (result: ReturnType<typeof projectLayout>) => result.workspaces.map(entry => entry.kind === 'workspace' && entry.item.workspaceId)
    const projectRows = (result: ReturnType<typeof projectLayout>) => result.workspaces.map(entry => entry.kind === 'workspace' && entry.rows.map(row => row.id))
    const recent = projectLayout([...items, extra], input, [], store.getSnapshot())
    expect(projectIds(recent)).toEqual(['w', 'w2'])
    expect(projectRows(recent)).toEqual([['b', 'a'], ['g', 'f']])
    store.setListSort('project:workspaces', 'manual')
    const manual = projectLayout([...items, extra], input, [], store.getSnapshot())
    expect(projectIds(manual)).toEqual(['w', 'w2'])
    expect(projectRows(manual)).toEqual([['a', 'b'], ['f', 'g']])
    const pinned = projectLayout([...items, extra], input, [{ kind: 'workspace', id: 'w' }], store.getSnapshot())
    expect(pinned.pinned[0]).toMatchObject({ rows: [row('b', 9), row('a', 1)] })
    expect(pinned.chats).toEqual(recent.chats)
  })

  it('置顶工作区和单个会话无重复，取消后恢复核心位置', () => {
    const pins = [{ kind: 'workspace' as const, id: 'w' }, { kind: 'session' as const, id: 'a' }]
    const result = projectLayout(items, buckets, pins)
    expect(result.workspaces).toEqual([])
    expect(result.pinned[0]).toMatchObject({ kind: 'workspace', rows: [row('b')] })
    expect(result.pinned[1]).toMatchObject({ kind: 'session', session: row('a'), item: items[0] })
    expect(projectLayout(items, buckets, []).workspaces[0]).toMatchObject({ rows: [row('a'), row('b')] })
    expect(items[0]!.sessionIds).toEqual(['a', 'b'])
  })

  it('独立对话按活动时间平铺，未归组不混入独立对话', () => {
    const result = projectLayout(items, buckets, [])
    expect(result.chats.map(entry => entry.kind === 'session' && entry.session.id)).toEqual(['e', 'd'])
    expect(result.workspaces).toHaveLength(1)
    expect(result.misc).toEqual([{ kind: 'session', session: row('misc') }])
    expect(projectLayout(items, buckets, [{ kind: 'session', id: 'misc' }]).misc).toEqual([])
  })

  it('平铺分区手动偏好只调整展示，缺少顺序的新增条目按更新时间补在后面', () => {
    const preferences = { sorts: { 'project:chats': 'manual' as const }, orders: { 'project:chats': ['gone', 'd'], 'project:misc': ['misc'] } }
    const result = projectLayout(items, buckets, [], preferences)
    expect(result.chats.map(entry => entry.kind === 'session' && entry.session.id)).toEqual(['d', 'e'])
    expect(projectLayout(items, buckets, [], { ...preferences, sorts: { 'project:chats': 'updated' } }).chats.map(entry => entry.kind === 'session' && entry.session.id)).toEqual(['e', 'd'])
    expect(items[1]!.sessionIds).toEqual(['d', 'e'])
  })

  it('归档、未加载或已移除的置顶不创建幽灵条目', () => {
    const pins = [{ kind: 'workspace' as const, id: 'gone' }, { kind: 'session' as const, id: 'archived' }]
    expect(projectLayout(items, buckets, pins).pinned).toEqual([])
    expect(projectLayout([], { rows: new Map(), misc: [] }, pins).pinned).toEqual([])
  })

  it('长列表始终显示当前项但不改变相对顺序', () => {
    expect(visibleEntries([1, 2, 3, 4, 5, 6, 7], false, item => item === 7)).toEqual([1, 2, 3, 4, 5, 7])
  })
})
