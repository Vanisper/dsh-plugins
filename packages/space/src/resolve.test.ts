import type { SpaceEntity } from './types.ts'
// @env node
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize, isUnder, resolveByCwd } from './resolve.ts'

let dir: string

beforeEach(async () => {
  // tmpdir 必然存在，canonicalize 不会返回 undefined
  dir = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-resolve-'))))!
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function spaceOf(folders: string[]): SpaceEntity {
  return { id: 'sp-test', name: '测试', folders: folders.map(path => ({ path })) }
}

describe('isUnder', () => {
  it('等值与前缀都算在内', () => {
    expect(isUnder('/a/b', '/a/b')).toBe(true)
    expect(isUnder('/a/b/c', '/a/b')).toBe(true)
    expect(isUnder('/a/bc', '/a/b')).toBe(false)
    expect(isUnder('/a', '/a/b')).toBe(false)
    expect(isUnder('/a/b/c', '/a/b/')).toBe(true)
  })
})

describe('resolveByCwd', () => {
  it('cwd 落在成员内即命中该空间', async () => {
    const deep = join(dir, 'sub', 'deep')
    await mkdir(deep, { recursive: true })
    const spaces = [spaceOf([dir])]
    expect(resolveByCwd(spaces, deep)?.folder.path).toBe(dir)
  })

  it('不命中任何成员时返回 undefined', () => {
    expect(resolveByCwd([spaceOf([dir])], tmpdir())).toBeUndefined()
  })

  it('嵌套成员取最长前缀（更具体的胜出）', async () => {
    const nested = join(dir, 'inner')
    await mkdir(nested)
    const spaces = [spaceOf([dir, nested])]
    expect(resolveByCwd(spaces, nested)?.folder.path).toBe(nested)
  })

  it('cwd 经 symlink 时按 realpath 判定', async () => {
    const link = join(dir, 'link')
    await symlink(dir, link, 'dir')
    expect(resolveByCwd([spaceOf([dir])], link)?.folder.path).toBe(dir)
  })
})
