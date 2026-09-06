import type { WorkspaceView } from './types.ts'
import { describe, expect, it } from 'vitest'
import { descriptionsOf, projectDescriptions } from './lookup.ts'

const rows: WorkspaceView[] = [
  { workspaceId: 'plain', path: '/plain', title: 'Plain', sessionIds: ['p'] },
  { workspaceId: 'space', path: '/space', title: 'Space', sessionIds: ['s'] },
  { workspaceId: 'chat', path: '/chat', title: 'Chat', sessionIds: ['c'] },
]

describe('projectDescriptions', () => {
  it('projects every core row in core order', () => {
    const result = projectDescriptions(rows, descriptionsOf([
      { workspaceId: 'space', members: [] },
    ], [{ workspaceId: 'chat' }]))
    expect(result.items.map(item => [item.kind, item.workspaceId])).toEqual([
      ['plain', 'plain'],
      ['space', 'space'],
      ['chat', 'chat'],
    ])
  })

  it('keeps missing descriptions as invalid records without inventing a row', () => {
    const result = projectDescriptions(rows, descriptionsOf([
      { workspaceId: 'gone', members: [] },
    ], []))
    expect(result.invalidSpaces).toEqual([{ workspaceId: 'gone', status: 'missing-workspace' }])
    expect(result.items).toHaveLength(3)
  })
})
