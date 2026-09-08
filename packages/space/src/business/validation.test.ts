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

  it('创建标识按小写保存，拒绝跨对话重复标识和无效格式', () => {
    const creationId = '081A2D14-98A9-487D-9068-AB3EC9EBEC92'
    const settings = { root: '', spaces: [], chats: [{ workspaceId: 'chat', creationId }] }
    expect(validateSettings(settings).chats[0]?.creationId).toBe(creationId.toLowerCase())
    expect(() => validateSettings({ ...settings, chats: [...settings.chats, { workspaceId: 'other', creationId: creationId.toLowerCase() }] })).toThrow('创建标识不能重复')
    expect(() => validateSettings({ ...settings, chats: [{ workspaceId: 'chat', creationId: '../outside' }] })).toThrow('UUID')
  })
})
