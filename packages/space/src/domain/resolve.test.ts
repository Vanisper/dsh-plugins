import type { SpaceEntity } from './types.ts'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { resolveAllByCwd, resolveByCwd } from './resolve.ts'

let root: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-resolve-'))))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function spaceOf(id: string, shell: string, partial: Partial<SpaceEntity> = {}): SpaceEntity {
  return { id, name: id, shell, workspaceId: `ws-${id}`, folders: [], ...partial }
}

describe('resolveByCwd', () => {
  it('cwd 在壳目录及其普通子目录内时命中', async () => {
    const shell = join(root, 'shell')
    const deep = join(shell, 'a', 'b')
    await mkdir(deep, { recursive: true })
    const space = spaceOf('sp', shell)
    expect(resolveByCwd([space], shell)).toBe(space)
    expect(resolveByCwd([space], deep)).toBe(space)
  })

  it('成员目录和 primary 都不参与归属解析', async () => {
    const shell = join(root, 'shell')
    const memberA = join(root, 'member-a')
    const memberB = join(root, 'member-b')
    await mkdir(shell)
    await mkdir(memberA)
    await mkdir(memberB)
    const first = spaceOf('sp', shell, { primary: memberA, folders: [{ path: memberA, mode: 'reference' }, { path: memberB, mode: 'reference' }] })
    const second = { ...first, primary: memberB }
    expect(resolveByCwd([first], memberA)).toBeUndefined()
    expect(resolveByCwd([second], memberB)).toBeUndefined()
    expect(resolveByCwd([first], shell)?.id).toBe(resolveByCwd([second], shell)?.id)
  })

  it('cwd 经 symlink 指向壳目录时按 realpath 命中', async () => {
    const shell = join(root, 'shell')
    const link = join(root, 'to-shell')
    await mkdir(shell)
    await symlink(shell, link, 'dir')
    expect(resolveByCwd([spaceOf('sp', shell)], link)?.id).toBe('sp')
  })

  it('cwd 经壳内 symlink 进入外部成员时 realpath 出壳，不命中', async () => {
    const shell = join(root, 'shell')
    const member = join(root, 'member')
    await mkdir(join(shell, 'projects'), { recursive: true })
    await mkdir(member)
    const link = join(shell, 'projects', 'member')
    await symlink(member, link, 'dir')
    expect(resolveByCwd([spaceOf('sp', shell)], link)).toBeUndefined()
  })

  it('壳目录子树重叠时全部命中，更深者优先', async () => {
    const outer = join(root, 'outer')
    const inner = join(outer, 'inner')
    await mkdir(inner, { recursive: true })
    const wide = spaceOf('wide', outer)
    const narrow = spaceOf('narrow', inner)
    expect(resolveAllByCwd([wide, narrow], inner).map(space => space.id)).toEqual(['narrow', 'wide'])
    expect(resolveByCwd([wide, narrow], outer)?.id).toBe('wide')
  })
})
