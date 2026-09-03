import { describe, expect, it } from 'vitest'
import { parseOperation } from './http.ts'

describe('parseOperation', () => {
  it('keeps the operation boundary strict', () => {
    expect(parseOperation({ op: 'create-space', name: 'demo' })).toEqual({ op: 'create-space', name: 'demo', folder: undefined, mode: undefined, linkName: undefined, title: undefined, description: undefined })
    expect(() => parseOperation({ op: 'create-space', name: 12 })).toThrow('name 必须是字符串')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', extra: true })).toThrow('未知字段')
    expect(() => parseOperation([])).toThrow('根必须是对象')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', mode: 'other' })).toThrow('mode')
  })

  it('maps only the supported operations', () => {
    expect(parseOperation({ op: 'description', workspace: 'w', target: 'm', value: 'text' })).toEqual({ op: 'description', workspace: 'w', target: 'm', value: 'text' })
    expect(() => parseOperation({ op: 'rename-workspace', workspace: 'w' })).toThrow('未知操作')
  })
})
