import type { SpaceOperations } from './operations.ts'
import { describe, expect, it, vi } from 'vitest'
import { dispatchOp, parseOperation } from './http.ts'

function operationsOf(): SpaceOperations {
  return {
    initialize: vi.fn(async () => {}),
    snapshot: vi.fn(() => ({ root: '/root', spaces: [], chats: [] })),
    coreRows: vi.fn(() => []),
    execute: vi.fn(async operation => ({ operation })),
    dispose: vi.fn(),
  }
}

describe('parseOperation', () => {
  it('把创建工作区的首成员与挂入模式保持为一个原子操作', () => {
    expect(parseOperation({ op: 'create-space', name: '甲', folder: '/repo', mode: 'link', linkName: 'repo' })).toEqual({ op: 'create-space', name: '甲', folder: '/repo', mode: 'link', linkName: 'repo', title: undefined, desc: undefined })
  })

  it('拒绝未知模式、缺少参数和重复排序空集合', () => {
    expect(() => parseOperation({ op: 'create-space', name: '甲', mode: 'copy' })).toThrow('mode')
    expect(() => parseOperation({ op: 'attach', space: '甲' })).toThrow('target')
    expect(() => parseOperation({ op: 'reorder-spaces', ids: [] })).toThrow('ids')
  })

  it('把显式 rebind 收窄为唯一目标', () => {
    expect(parseOperation({ op: 'rebind', space: '甲' })).toEqual({ op: 'rebind-space', space: '甲' })
    expect(parseOperation({ op: 'rebind', chat: '/chat' })).toEqual({ op: 'rebind-chat', chat: '/chat' })
    expect(() => parseOperation({ op: 'rebind', space: '甲', chat: '/chat' })).toThrow('只能提供一个')
    expect(() => parseOperation({ op: 'rebind' })).toThrow('需要 space 或 chat')
  })
})

describe('dispatchOp', () => {
  it('http adapter 只负责解析并调用统一操作模块', async () => {
    const operations = operationsOf()
    const result = await dispatchOp(operations, { op: 'primary', space: '甲', target: '/repo' })
    expect(operations.execute).toHaveBeenCalledWith({ op: 'primary', space: '甲', target: '/repo' })
    expect(result).toEqual({ operation: { op: 'primary', space: '甲', target: '/repo' } })
  })
})
