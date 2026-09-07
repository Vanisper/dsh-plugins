// @vitest-environment jsdom
import type { RegistryItem } from './types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayoutStore, projectLayout, visibleEntries } from './layout.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('侧栏展示偏好', () => {
  it('校验持久化输入并补齐三个分区，类型不同的同名 ID 可独立置顶', () => {
    localStorage.setItem('dsh-space.sidebar.layout', JSON.stringify({ sections: ['chats', 'chats', 'other'], pins: [null, { kind: 'session', id: 's' }, { kind: 'session', id: 's' }] }))
    const store = createLayoutStore()
    store.setPinned({ kind: 'workspace', id: 's' }, true)
    expect(store.getSnapshot().sections).toEqual(['chats', 'pinned', 'workspaces'])
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
    expect(store.getSnapshot()).toMatchObject({ pins: [session, workspace], sections: ['workspaces', 'pinned', 'chats'], collapsed: ['pinned'] })
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
    expect(createLayoutStore().getSnapshot()).toMatchObject({ view: 'workspaces', sessionSort: 'updated', groups: [{ id: 'g', title: '分组', color: 'gray', collapsed: false }], assignments: { s: 'g' } })
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
  })

  it('切换视图和排序不会覆盖其他页面的分组变更', () => {
    const store = createLayoutStore()
    createLayoutStore().saveGroup({ id: 'g', title: '一', color: 'blue', collapsed: false }, true)
    store.setView('groups')
    store.setSort({ workspaceSort: 'updated', sessionSort: 'manual' })
    expect(store.getSnapshot()).toMatchObject({ view: 'groups', workspaceSort: 'updated', sessionSort: 'manual', groups: [{ id: 'g' }] })
  })

  it('两个视图默认最近更新，旧按标题偏好回退且手动偏好保留', () => {
    expect(createLayoutStore().getSnapshot()).toMatchObject({ workspaceSort: 'updated', sessionSort: 'updated' })
    localStorage.setItem('dsh-space.sidebar.layout', JSON.stringify({ sessionSort: 'title', workspaceSort: 'manual', groupSessionOrder: ['a', 'a', null, 3, 'b'] }))
    expect(createLayoutStore().getSnapshot()).toMatchObject({ sessionSort: 'updated', workspaceSort: 'manual', groupSessionOrder: ['a', 'b'] })
  })

  it('分组手动顺序独立保存，重新载入和切换排序不会改写项目偏好', () => {
    const store = createLayoutStore()
    store.saveGroup({ id: 'g', title: '分组', color: 'gray', collapsed: false }, true)
    store.setSort({ sessionSort: 'manual' })
    store.moveGroupSession({ id: 'c', before: 'a', groupId: 'g', order: ['a', 'b', 'c'] })
    expect(createLayoutStore().getSnapshot()).toMatchObject({ groupSessionOrder: ['c', 'a', 'b'], assignments: { c: 'g' }, workspaceSort: 'updated' })
    store.setSort({ sessionSort: 'updated' })
    store.moveGroupSession({ id: 'b', before: 'c', order: ['c', 'a', 'b'] })
    expect(store.getSnapshot().groupSessionOrder).toEqual(['c', 'a', 'b'])
    store.setSort({ sessionSort: 'manual' })
    expect(store.getSnapshot().groupSessionOrder).toEqual(['c', 'a', 'b'])
  })
})

describe('分区投影', () => {
  const row = (id: string, updatedAt = 1) => ({ id, updatedAt, displayTitle: id, blank: false, running: false, runningSubagentCount: 0 })
  const items: RegistryItem[] = [
    { kind: 'space', workspaceId: 'w', path: '/w', title: 'w', sessionIds: ['a', 'b'] },
    { kind: 'chat', workspaceId: 'c', path: '/c', title: 'c', sessionIds: ['d', 'e'] },
  ]
  const buckets = { rows: new Map([['w', [row('a'), row('b')]], ['c', [row('d'), row('e', 2)]]]), misc: [row('misc')] }

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
