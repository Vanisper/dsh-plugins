import type { SpaceEntity } from './types.ts'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { resolveAllByCwd, resolveByCwd } from './resolve.ts'

let dir: string

beforeEach(async () => {
  dir = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-resolve-'))))!
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function spaceOf(partial: Partial<SpaceEntity> & { id: string, name: string }): SpaceEntity {
  return { folders: [], ...partial }
}

describe('resolveByCwd（有效路径唯一匹配面）', () => {
  it('cwd 在壳内（含子目录）命中该空间', async () => {
    const shell = join(dir, 'shell')
    const deep = join(shell, 'a', 'b')
    await mkdir(deep, { recursive: true })
    const space = spaceOf({ id: 'sp', name: '甲', shell, folders: [{ path: join(dir, 'member'), mode: 'reference' }] })
    expect(resolveByCwd([space], shell)?.id).toBe('sp')
    expect(resolveByCwd([space], deep)?.id).toBe('sp')
  })

  it('cwd 在成员目录内不命中——成员不是匹配面', async () => {
    const member = join(dir, 'member')
    await mkdir(member)
    const space = spaceOf({ id: 'sp', name: '甲', shell: join(dir, 'shell'), folders: [{ path: member, mode: 'reference' }] })
    await mkdir(space.shell!)
    expect(resolveByCwd([space], member)).toBeUndefined()
  })

  it('无壳时走 primary；无 primary 时走首位成员（链各级独立成立）', async () => {
    const a = join(dir, 'a')
    const b = join(dir, 'b')
    await mkdir(a)
    await mkdir(b)
    const withPrimary = spaceOf({ id: 'sp-1', name: '甲', folders: [{ path: a, mode: 'reference' }, { path: b, mode: 'reference' }], primary: b })
    expect(resolveByCwd([withPrimary], b)?.id).toBe('sp-1')
    expect(resolveByCwd([withPrimary], a)).toBeUndefined()
    const bare = spaceOf({ id: 'sp-2', name: '乙', folders: [{ path: a, mode: 'reference' }, { path: b, mode: 'reference' }] })
    expect(resolveByCwd([bare], a)?.id).toBe('sp-2')
  })

  it('无有效路径的纯注解合集永不命中', () => {
    const space = spaceOf({ id: 'sp', name: '甲', folders: [] })
    expect(resolveByCwd([space], dir)).toBeUndefined()
  })

  it('cwd 经 symlink 进入壳子树时按 realpath 判定', async () => {
    const shell = join(dir, 'shell')
    await mkdir(shell)
    const link = join(dir, 'to-shell')
    await symlink(shell, link, 'dir')
    expect(resolveByCwd([spaceOf({ id: 'sp', name: '甲', shell })], link)?.id).toBe('sp')
  })

  it('cwd 经壳内 link 进入成员时 realpath 出壳、不命中', async () => {
    const shell = join(dir, 'shell')
    const member = join(dir, 'member')
    await mkdir(join(shell, 'projects'), { recursive: true })
    await mkdir(member)
    await symlink(member, join(shell, 'projects', 'member'), 'dir')
    const space = spaceOf({ id: 'sp', name: '甲', shell, folders: [{ path: member, mode: 'link', linkPath: join(shell, 'projects', 'member') }] })
    expect(resolveByCwd([space], join(shell, 'projects', 'member'))).toBeUndefined()
  })

  it('不命中任何空间时返回 undefined', () => {
    expect(resolveByCwd([spaceOf({ id: 'sp', name: '甲', shell: join(dir, 'shell') })], tmpdir())).toBeUndefined()
  })

  it('有效路径子树重叠时全部命中，更深者胜', async () => {
    const outer = join(dir, 'outer')
    const inner = join(dir, 'outer', 'inner')
    await mkdir(inner, { recursive: true })
    const wide = spaceOf({ id: 'sp-wide', name: '宽', primary: outer })
    const narrow = spaceOf({ id: 'sp-narrow', name: '窄', primary: inner })
    expect(resolveAllByCwd([wide, narrow], inner).map(space => space.id)).toEqual(['sp-narrow', 'sp-wide'])
    expect(resolveByCwd([wide, narrow], inner)?.id).toBe('sp-narrow')
    expect(resolveByCwd([wide, narrow], outer)?.id).toBe('sp-wide')
  })
})
