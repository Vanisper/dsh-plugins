import type { RegistryPayload, SessionSnapshot, WorkspaceSnapshot } from './types.ts'
import { describe, expect, it } from 'vitest'
import { groupSessions } from './model.ts'

const registry: RegistryPayload = {
  ok: true,
  root: '/dsh',
  items: [
    { kind: 'plain', workspaceId: 'plain', path: '/plain', title: 'Plain', sessionIds: [] },
    { kind: 'space', workspaceId: 'space', path: '/space', title: 'Space', sessionIds: [] },
  ],
  invalidSpaces: [],
  invalidChats: [],
}

const sessions: SessionSnapshot = {
  ids: ['s2', 's1', 'orphan'],
  byId: {
    s1: { id: 's1', displayTitle: 'one', updatedAt: 1, running: false, blank: false },
    s2: { id: 's2', displayTitle: 'two', updatedAt: 2, running: false, blank: false },
    orphan: { id: 'orphan', displayTitle: 'orphan', updatedAt: 3, running: false, blank: false },
  },
}

const workspaces: WorkspaceSnapshot = {
  phase: 'ready',
  archivedSessionIds: [],
  items: [
    { workspaceId: 'plain', path: '/plain', title: 'Plain', sessionIds: [] },
    { workspaceId: 'space', path: '/space', title: 'Space', sessionIds: ['s1', 's2'] },
  ],
}

describe('groupSessions', () => {
  it('uses only core sessionIds and preserves their order', () => {
    const result = groupSessions(registry, sessions, workspaces)
    expect(result.rows.get('space')?.map(row => row.id)).toEqual(['s1', 's2'])
    expect(result.misc.map(row => row.id)).toEqual(['orphan'])
  })

  it('does not expose a temporary ungrouped row before the core baseline is ready', () => {
    const result = groupSessions(registry, sessions, { ...workspaces, phase: 'pending', items: [] })
    expect(result.misc).toEqual([])
  })
})
