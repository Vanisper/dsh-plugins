import { describe, expect, it } from 'vitest'
import { validateSettings } from './validation.ts'

describe('validateSettings', () => {
  it('preserves an empty root and rejects unknown or malformed fields', () => {
    expect(validateSettings({ root: '', spaces: [], chats: [] }).root).toBe('')
    expect(() => validateSettings({ root: '', spaces: [], chats: [], extra: true })).toThrow('未知字段')
    expect(() => validateSettings({ root: '', spaces: [{ workspaceId: 'x', members: [{ path: '/x', mode: 'reference', linkName: null }] }], chats: [] })).toThrow()
  })

  it('requires primary to refer to a member and rejects duplicate ownership', () => {
    expect(() => validateSettings({ root: '', spaces: [{ workspaceId: 'x', primary: '/missing', members: [{ path: '/x', mode: 'reference' }] }], chats: [] })).toThrow('primary')
    expect(() => validateSettings({ root: '', spaces: [{ workspaceId: 'x', members: [] }], chats: [{ workspaceId: 'x' }] })).toThrow('多个插件描述')
  })
})
