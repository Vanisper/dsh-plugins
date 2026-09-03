import type { RegistryPayload, SessionSnapshot, WorkspaceSnapshot } from './types.ts'
import { describe, expect, it } from 'vitest'
import { groupSessions, moveAnchor, projectRegistry, searchRows, sessionMoveAnchor } from './model.ts'

const registry: RegistryPayload = {
  ok: true,
  root: '/dsh',
  items: [
    { kind: 'plain', workspaceId: 'plain', path: '/old-path', title: 'Old title', sessionIds: [] },
    { kind: 'space', workspaceId: 'space', path: '/space', title: 'Space', sessionIds: [], members: [] },
  ],
  invalidSpaces: [],
  invalidChats: [],
}

const sessions: SessionSnapshot = {
  phase: 'ready',
  current: 'blank',
  ids: ['s2', 's1', 'blank', 'other-blank', 'child', 'orphan'],
  byId: {
    's1': { id: 's1', displayTitle: 'one', updatedAt: 1, running: false, blank: false },
    's2': { id: 's2', displayTitle: 'two', updatedAt: 2, running: false, blank: false },
    'blank': { id: 'blank', displayTitle: 'blank', updatedAt: 3, running: false, blank: true },
    'other-blank': { id: 'other-blank', displayTitle: 'other blank', updatedAt: 4, running: false, blank: true },
    'child': { id: 'child', displayTitle: 'child', updatedAt: 5, running: true, blank: false, origin: 'subagent', parentId: 's1' },
    'orphan': { id: 'orphan', displayTitle: 'orphan', updatedAt: 6, running: false, blank: false },
  },
}

const workspaces: WorkspaceSnapshot = {
  phase: 'ready',
  state: 'idle',
  error: null,
  baselinesReady: true,
  archivedSessionIds: [],
  items: [
    { workspaceId: 'plain', path: '/plain', title: 'Plain', sessionIds: ['blank', 'other-blank'] },
    { workspaceId: 'space', path: '/space', title: 'Space renamed', sessionIds: ['s1', 's2'] },
  ],
}

describe('projectRegistry', () => {
  it('uses the live core order and fields while retaining supplemental descriptions', () => {
    const result = projectRegistry(registry, workspaces)
    expect(result.map(item => [item.workspaceId, item.kind, item.title])).toEqual([
      ['plain', 'plain', 'Plain'],
      ['space', 'space', 'Space renamed'],
    ])
  })

  it('falls back to plain workspaces while descriptions are unavailable', () => {
    expect(projectRegistry(undefined, workspaces).every(item => item.kind === 'plain')).toBe(true)
  })
})

describe('groupSessions', () => {
  it('uses only core sessionIds and preserves their order', () => {
    const items = projectRegistry(registry, workspaces)
    const result = groupSessions(items, sessions, workspaces)
    expect(result.rows.get('space')?.map(row => row.id)).toEqual(['s1', 's2'])
    expect(result.rows.get('space')?.[0]?.runningSubagentCount).toBe(1)
    expect(result.misc.map(row => row.id)).toEqual(['orphan'])
  })

  it('shows only the selected blank session', () => {
    const result = groupSessions(projectRegistry(registry, workspaces), sessions, workspaces)
    expect(result.rows.get('plain')?.map(row => row.id)).toEqual(['blank'])
  })

  it('does not expose a temporary ungrouped row before both baselines are ready', () => {
    const result = groupSessions([], sessions, { ...workspaces, phase: 'pending', items: [] })
    expect(result.misc).toEqual([])
  })

  it('hides archived sessions', () => {
    const result = groupSessions(projectRegistry(registry, workspaces), sessions, { ...workspaces, archivedSessionIds: ['s1'] })
    expect(result.rows.get('space')?.map(row => row.id)).toEqual(['s2'])
  })
})

describe('searchRows', () => {
  it('merges local title matches and remote snippets without duplicates', () => {
    const result = searchRows('one', projectRegistry(registry, workspaces), sessions, [], {
      items: [{ sessionId: 's1', snippet: 'matched content' }, { sessionId: 's2', snippet: 'other content' }],
      hasMore: false,
    }, 20)
    expect(result.items.map(item => item.id)).toEqual(['s1', 's2'])
    expect(result.items[0]?.snippet).toBe('matched content')
  })

  it('does not restore hidden blank sessions from remote results', () => {
    const result = searchRows('blank', projectRegistry(registry, workspaces), sessions, [], {
      items: [{ sessionId: 'other-blank', snippet: 'hidden' }],
      hasMore: false,
    }, 20)
    expect(result.items.map(item => item.id)).toEqual(['blank'])
  })
})

describe('move anchors', () => {
  it('uses DOM insert-before semantics for workspace moves', () => {
    expect(moveAnchor(workspaces.items, 'space', -1)).toBe('plain')
    expect(moveAnchor(workspaces.items, 'plain', 1)).toBeUndefined()
    expect(moveAnchor(workspaces.items, 'plain', -1)).toBeNull()
  })

  it('uses DOM insert-before semantics for session moves', () => {
    expect(sessionMoveAnchor(workspaces.items[1]!, 's2', -1)).toBe('s1')
    expect(sessionMoveAnchor(workspaces.items[1]!, 's1', 1)).toBeUndefined()
  })
})
