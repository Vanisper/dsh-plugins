// @env node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize, isUnder, locateSpace } from './locate.ts'

let dir: string

beforeEach(async () => {
  // tmpdir 必然存在，canonicalize 不会返回 undefined
  dir = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-locate-'))))!
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('isUnder', () => {
  it('等值与前缀都算在内', () => {
    expect(isUnder('/a/b', '/a/b')).toBe(true)
    expect(isUnder('/a/b/c', '/a/b')).toBe(true)
    expect(isUnder('/a/bc', '/a/b')).toBe(false)
    expect(isUnder('/a', '/a/b')).toBe(false)
    expect(isUnder('/a/b/c', '/a/b/')).toBe(true)
  })
})

describe('locateSpace', () => {
  it('从深层子目录向上找到壳根', async () => {
    await writeFile(join(dir, 'space.yaml'), 'version: 1\nname: t\n')
    const nested = join(dir, 'projects', 'foo', 'src')
    await mkdir(nested, { recursive: true })
    const space = await locateSpace(nested)
    expect(space?.root).toBe(dir)
    expect(space?.file.name).toBe('t')
  })

  it('没有 space.yaml 时返回 undefined', async () => {
    expect(await locateSpace(dir)).toBeUndefined()
  })

  it('space.yaml 损坏时不抛出、视为无空间', async () => {
    await writeFile(join(dir, 'space.yaml'), 'version: 2\n')
    expect(await locateSpace(dir)).toBeUndefined()
  })

  it('穿过 symlink 定位（cwd 经 realpath 后再向上找）', async () => {
    await writeFile(join(dir, 'space.yaml'), 'version: 1\nname: t\n')
    const real = join(dir, 'projects', 'foo')
    await mkdir(real, { recursive: true })
    const linkParent = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-link-'))))!
    const link = join(linkParent, 'foo-link')
    await symlink(real, link, 'dir')
    // symlink 目标在壳内 → 找到；这是「穿过链接看真实身份」的语义
    expect((await locateSpace(link))?.root).toBe(dir)
    await rm(linkParent, { recursive: true, force: true })
  })
})
