import type { RegistryPayload, SessionRow } from './types.ts'
import { describe, expect, it } from 'vitest'
import { bindingState, groupSessions } from './model.ts'

const session = (id: string, cwd: string, updatedAt = 1): SessionRow => ({ id, cwd, displayTitle: id, running: false, blank: false, updatedAt })

function registry(primary = '/repo-a'): Pick<RegistryPayload, 'spaces' | 'chats'> {
  return {
    spaces: [{
      id: 'sp-1',
      name: '工作区',
      shell: '/managed/shell',
      primary,
      workspaceId: 'ws-space',
      folders: [{ path: '/repo-a', mode: 'reference' }, { path: '/repo-b', mode: 'reference' }],
    }],
    chats: [{ path: '/managed/chats/2026-09-02/topic', workspaceId: 'ws-chat' }],
  }
}

describe('bindingState', () => {
  it('区分同步中、悬空、错位与有效绑定', () => {
    expect(bindingState('ws-space', '/managed/shell', { items: [], archivedSessionIds: [], phase: 'pending' })).toBe('pending')
    expect(bindingState('ws-space', '/managed/shell', { items: [], archivedSessionIds: [], phase: 'ready' })).toBe('dangling')
    expect(bindingState('ws-space', '/managed/shell', { items: [{ workspaceId: 'ws-space', path: '/other', title: 'x', sessionIds: [] }], archivedSessionIds: [], phase: 'ready' })).toBe('mismatch')
    expect(bindingState('ws-space', '/managed/shell', { items: [{ workspaceId: 'ws-space', path: '/managed/shell', title: 'x', sessionIds: [] }], archivedSessionIds: [], phase: 'ready' })).toBe('ready')
  })
})

describe('groupSessions', () => {
  it('只按核心 sessionIds 分桶，cwd 命中壳目录也不会被猜测认领', () => {
    const owned = session('owned', '/managed/shell', 2)
    const guessed = session('guessed', '/managed/shell', 1)
    const buckets = groupSessions(
      registry(),
      { ids: [owned.id, guessed.id], byId: { owned, guessed } },
      { items: [{ workspaceId: 'ws-space', path: '/managed/shell', title: '工作区', sessionIds: ['owned'] }], archivedSessionIds: [], phase: 'ready' },
    )
    expect(buckets.spaceRows.get('sp-1')?.map(row => row.id)).toEqual(['owned'])
    expect(buckets.misc.map(row => row.id)).toEqual(['guessed'])
  })

  it('切换 primary 不改变会话归组', () => {
    const row = session('s1', '/managed/shell')
    const workspaces = { items: [{ workspaceId: 'ws-space', path: '/managed/shell', title: '工作区', sessionIds: ['s1'] }], archivedSessionIds: [], phase: 'ready' as const }
    const sessions = { ids: ['s1'], byId: { s1: row } }
    expect(groupSessions(registry('/repo-a'), sessions, workspaces).spaceRows.get('sp-1')).toEqual([row])
    expect(groupSessions(registry('/repo-b'), sessions, workspaces).spaceRows.get('sp-1')).toEqual([row])
  })

  it('核心行 path 与附加记录错位时不认领其会话', () => {
    const row = session('misbound', '/other')
    const buckets = groupSessions(
      registry(),
      { ids: [row.id], byId: { misbound: row } },
      { items: [{ workspaceId: 'ws-space', path: '/other', title: '错误绑定', sessionIds: [row.id] }], archivedSessionIds: [], phase: 'ready' },
    )
    expect(buckets.spaceRows.get('sp-1')).toEqual([])
    expect(buckets.misc).toEqual([row])
  })

  it('对话使用自己的核心账目，归档、空白和 subagent 会话不展示', () => {
    const chat = session('chat', '/managed/chats/2026-09-02/topic', 4)
    const archived = session('archived', '/managed/shell', 3)
    const blank = { ...session('blank', '/managed/shell', 2), blank: true }
    const subagent = { ...session('subagent', '/managed/shell', 1), origin: 'subagent' as const }
    const buckets = groupSessions(
      registry(),
      { ids: ['chat', 'archived', 'blank', 'subagent'], byId: { chat, archived, blank, subagent } },
      {
        items: [
          { workspaceId: 'ws-space', path: '/managed/shell', title: '工作区', sessionIds: ['archived', 'blank', 'subagent'] },
          { workspaceId: 'ws-chat', path: chat.cwd!, title: 'topic', sessionIds: ['chat'] },
        ],
        archivedSessionIds: ['archived'],
        phase: 'ready',
      },
    )
    expect(buckets.chatRows.get('/managed/chats/2026-09-02/topic')).toEqual([chat])
    expect(buckets.spaceRows.get('sp-1')).toEqual([])
    expect(buckets.misc).toEqual([])
  })
})
