import { describe, expect, it } from 'vitest'
import { normalizeProjectPath, parseSpaceFile, serializeSpaceFile } from './space-file.ts'

describe('parseSpaceFile', () => {
  it('解析合法文件并保留未知字段', () => {
    const file = parseSpaceFile([
      'version: 1',
      'name: 我的空间',
      'custom: 123',
      'projects:',
      '  - path: projects/foo',
      '    title: Foo',
      '    desc: 主服务',
      '  - path: projects/bar',
    ].join('\n'))
    expect(file.name).toBe('我的空间')
    expect(file.projects).toEqual([
      { path: 'projects/foo', title: 'Foo', desc: '主服务' },
      { path: 'projects/bar' },
    ])
    expect(file.extras).toEqual({ custom: 123 })
  })

  it('拒绝非 1 的 version', () => {
    expect(() => parseSpaceFile('version: 2\nname: x\n')).toThrow('version 必须为 1')
  })

  it('拒绝缺失 name', () => {
    expect(() => parseSpaceFile('version: 1\n')).toThrow('name 必须是非空字符串')
  })

  it('拒绝重复路径与越界路径，并汇总所有问题', () => {
    const text = [
      'version: 1',
      'name: x',
      'projects:',
      '  - path: projects/foo',
      '  - path: projects/foo',
      '  - path: ../outside',
    ].join('\n')
    expect(() => parseSpaceFile(text)).toThrow(/路径重复.*path 缺失|path 缺失.*路径重复/s)
  })
})

describe('normalizeProjectPath', () => {
  it('归一分隔符与冗余段', () => {
    expect(normalizeProjectPath('projects\\foo\\')).toBe('projects/foo')
    expect(normalizeProjectPath('./projects/./foo')).toBe('projects/foo')
    expect(normalizeProjectPath('projects/a/../foo')).toBe('projects/foo')
  })

  it('拒绝绝对路径与越出壳根的相对路径', () => {
    expect(normalizeProjectPath('/abs/path')).toBeUndefined()
    expect(normalizeProjectPath('C:/abs')).toBeUndefined()
    expect(normalizeProjectPath('../outside')).toBeUndefined()
    expect(normalizeProjectPath('')).toBeUndefined()
    expect(normalizeProjectPath(42)).toBeUndefined()
  })
})

describe('serializeSpaceFile', () => {
  it('序列化后可被解析回等价数据', () => {
    const original = parseSpaceFile([
      'version: 1',
      'name: 空间',
      'projects:',
      '  - path: projects/foo',
      '    desc: 说明',
    ].join('\n'))
    const roundTripped = parseSpaceFile(serializeSpaceFile(original))
    expect(roundTripped.name).toBe(original.name)
    expect(roundTripped.projects).toEqual(original.projects)
    expect(roundTripped.extras).toEqual(original.extras)
  })
})
