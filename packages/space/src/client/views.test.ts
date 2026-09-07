// @vitest-environment jsdom
import type { RegistryItem, SessionSnapshot, WorkspaceSnapshot } from './types.ts'
import { afterEach, expect, it } from 'vitest'
import { createLayoutStore } from './layout.ts'
import { archivedEntries, projectGroups, sortWorkspaces } from './views.ts'

afterEach(() => localStorage.clear())
const row = (id: string, updatedAt = 1) => ({ id, updatedAt, displayTitle: id, blank: false, running: false, runningSubagentCount: 0 })
const items: RegistryItem[] = [
  { kind: 'space', workspaceId: 'w', path: '/w', title: '空间', sessionIds: ['a', 'b'] },
  { kind: 'chat', workspaceId: 'c', path: '/c', title: '独立', sessionIds: ['c'] },
]
const buckets = { rows: new Map([['w', [row('a'), row('b', 3)]], ['c', [row('c', 2)]]]), misc: [row('misc')] }

it('所有归属平铺，置顶工作区不隐藏会话，单个置顶优先且保留分组标记', () => {
  const store = createLayoutStore()
  store.saveGroup({ id: 'g', title: '分组', color: 'blue', collapsed: false }, true)
  store.assignGroup('a', 'g')
  store.assignGroup('c', 'g')
  store.setPinned({ kind: 'workspace', id: 'w' }, true)
  store.setPinned({ kind: 'session', id: 'a' }, true)
  const result = projectGroups(items, buckets, store.getSnapshot())
  expect(result.pinned.map(entry => entry.session.id)).toEqual(['a'])
  expect(result.groups[0]?.entries.map(entry => entry.session.id)).toEqual(['c'])
  expect(result.ungrouped.map(entry => entry.session.id)).toEqual(['b', 'misc'])
  store.setPinned({ kind: 'session', id: 'a' }, false)
  expect(projectGroups(items, buckets, store.getSnapshot()).groups[0]?.entries.map(entry => entry.session.id)).toEqual(['c', 'a'])
  expect(items[0]?.sessionIds).toEqual(['a', 'b'])
})

it('活动排序不改写核心顺序，回到手动排序仍使用原始引用', () => {
  const sorted = sortWorkspaces(items, buckets, 'updated')
  expect(sorted.buckets.rows.get('w')?.map(row => row.id)).toEqual(['b', 'a'])
  expect(buckets.rows.get('w')?.map(row => row.id)).toEqual(['a', 'b'])
  expect(sortWorkspaces(items, buckets, 'manual').buckets).toBe(buckets)
  const reversed = [...items].reverse()
  expect(sortWorkspaces(reversed, buckets, 'updated').items).toBe(reversed)
})

it('归档投影包含空白记录，过滤与排序不修改核心数据，缺失摘要单独报告', () => {
  const sessions: SessionSnapshot = { ids: ['a', 'b'], byId: { a: { ...row('a'), blank: true }, b: row('b') }, phase: 'ready' }
  const workspaces = { archivedSessionIds: ['a', 'missing', 'a'], phase: 'ready' } as WorkspaceSnapshot
  const result = archivedEntries(items, sessions, workspaces, '空间', 'updated')
  expect(result.entries.map(entry => entry.session.id)).toEqual(['a'])
  expect(result.missing).toBe(1)
  expect(archivedEntries(items, sessions, workspaces, '不匹配', 'title').entries).toEqual([])
  expect(archivedEntries(items, { ...sessions, phase: 'pending' }, workspaces, '', 'updated')).toEqual({ entries: [], missing: 0 })
})
