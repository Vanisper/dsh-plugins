import type { SpaceEntity } from './types.ts'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { attachFolder, bindWorkspaceId, createSpace, detachFolder, dropSpace, effectivePath, findSpace, listFolders, setFolderDesc, setFolderTitle, setPrimary } from './space.ts'

let root: string
let dirA: string
let dirB: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-root-'))))!
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-a-'))))!
  dirB = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-b-'))))!
})

afterEach(async () => {
  for (const dir of [root, dirA, dirB])
    await rm(dir, { recursive: true, force: true })
})

const basenameOf = (path: string): string => path.split('/').pop()!

describe('createSpace', () => {
  it('建壳目录与 projects/', async () => {
    const { space } = await createSpace([], '我的空间', root)
    expect(space.shell).toBe(join(root, 'spaces', '我的空间'))
    expect(await canonicalize(join(space.shell!, 'projects'))).toBeTruthy()
    expect(space.folders).toEqual([])
    expect(space.primary).toBeUndefined()
    expect(space.workspaceId).toBeUndefined()
  })

  it('重名与非法名被拒绝', async () => {
    const { data } = await createSpace([], 's', root)
    await expect(createSpace(data, 's', root)).rejects.toThrow('已存在')
    await expect(createSpace([], 'a/b', root)).rejects.toThrow('非法字符')
  })

  it('首个成员自动挂入并成为主成员（默认 reference，不建链接）', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    expect(space.primary).toBe(dirA)
    expect(space.folders[0]?.mode).toBe('reference')
    expect(space.folders[0]?.linkPath).toBeUndefined()
    // 壳内 projects/ 不应有任何链接
    expect((await listFolders(space))[0]?.linkHealth).toBe('none')
  })
})

describe('attachFolder', () => {
  it('默认 reference 不动磁盘；显式 link 建 symlink', async () => {
    let { data } = await createSpace([], 's', root)
    const referenced = await attachFolder(data, 's', dirA)
    expect(referenced.folder.mode).toBe('reference')
    expect(referenced.folder.linkPath).toBeUndefined()

    data = referenced.data
    const linked = await attachFolder(data, 's', dirB, { mode: 'link' })
    expect(linked.folder.mode).toBe('link')
    expect((await lstat(linked.folder.linkPath!)).isSymbolicLink()).toBe(true)
  })

  it('link 可用 name 指定链接名，壳内重名被拒', async () => {
    const { data } = await createSpace([], 's', root)
    await attachFolder(data, 's', dirA, { mode: 'link', name: 'alpha' })
    await expect(attachFolder(data, 's', dirB, { mode: 'link', name: 'alpha' })).rejects.toThrow('同名链接')
  })

  it('同空间同路径重复被拒；跨空间允许', async () => {
    const { data } = await createSpace([], 's1', root, dirA)
    await expect(attachFolder(data, 's1', dirA)).rejects.toThrow('无需重复挂入')
    const second = await createSpace(data, 's2', root)
    await expect(attachFolder(second.data, 's2', dirA)).resolves.toBeTruthy()
  })

  it('title 撞身份键被拒（路径/目录名/既有 title）', async () => {
    const { data } = await createSpace([], 's', root, dirA)
    await expect(attachFolder(data, 's', dirB, { title: basenameOf(dirA) })).rejects.toThrow('冲突')
  })
})

describe('detachFolder', () => {
  it('link 成员连带删 symlink，真实目录不动', async () => {
    let { data } = await createSpace([], 's', root, dirA)
    const attached = await attachFolder(data, 's', dirB, { mode: 'link' })
    data = attached.data
    const result = await detachFolder(data, 's', dirB)
    expect(await canonicalize(attached.folder.linkPath!)).toBeUndefined()
    expect(await canonicalize(dirB)).toBeTruthy()
    expect(result.space.folders.map(f => f.path)).toEqual([dirA])
  })

  it('摘除主成员时 primary 回退为剩余首位', async () => {
    let { data } = await createSpace([], 's', root, dirA)
    data = (await attachFolder(data, 's', dirB)).data
    const result = await detachFolder(data, 's', dirA)
    expect(result.space.primary).toBe(dirB)
  })
})

describe('setPrimary / setFolderTitle / setFolderDesc', () => {
  it('primary 是纯字段设置，不改变数组顺序', async () => {
    let { data } = await createSpace([], 's', root, dirA)
    data = (await attachFolder(data, 's', dirB)).data
    const result = await setPrimary(data, 's', dirB)
    expect(result.space.primary).toBe(dirB)
    expect(result.space.folders.map(f => f.path)).toEqual([dirA, dirB])
  })

  it('title/desc 可设可清（空串清除）', async () => {
    let { data } = await createSpace([], 's', root, dirA)
    data = (await setFolderTitle(data, 's', dirA, '前端仓库')).data
    expect(findSpace(data, 's').folders[0]?.title).toBe('前端仓库')
    data = (await setFolderDesc(data, 's', '前端仓库', '日常开发')).data
    expect(findSpace(data, 's').folders[0]?.desc).toBe('日常开发')
    data = (await setFolderTitle(data, 's', dirA, '')).data
    expect(findSpace(data, 's').folders[0]?.title).toBeUndefined()
  })
})

describe('dropSpace', () => {
  it('只删注册表，壳目录不动', async () => {
    const { data, space } = await createSpace([], 's', root)
    const result = dropSpace(data, 's')
    expect(result.data).toEqual([])
    expect(await canonicalize(space.shell!)).toBeTruthy()
  })
})

describe('listFolders', () => {
  it('link 健康度：ok / broken / none', async () => {
    let { data } = await createSpace([], 's', root)
    data = (await attachFolder(data, 's', dirA, { mode: 'link' })).data
    data = (await attachFolder(data, 's', dirB, { mode: 'reference' })).data
    const space = findSpace(data, 's')
    let statuses = await listFolders(space)
    expect(statuses.map(s => s.linkHealth)).toEqual(['ok', 'none'])

    // 弄断 link：删掉壳内 symlink
    await rm(space.folders[0]!.linkPath!)
    statuses = await listFolders(space)
    expect(statuses[0]?.linkHealth).toBe('broken')
  })

  it('成员目录缺失报 missing', async () => {
    const { data } = await createSpace([], 's', root, dirA)
    await rm(dirA, { recursive: true, force: true })
    const statuses = await listFolders(findSpace(data, 's'))
    expect(statuses[0]?.health).toBe('missing')
  })
})

describe('effectivePath（壳 → primary → 首位成员）', () => {
  it('有壳时壳优先，primary 不参与', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    expect(effectivePath(space)).toBe(space.shell)
  })

  it('无壳时走 primary；连 primary 也没有时走首位成员', () => {
    const bare: SpaceEntity = { id: 'sp', name: '甲', folders: [{ path: dirA, mode: 'reference' }, { path: dirB, mode: 'reference' }] }
    expect(effectivePath(bare)).toBe(dirA)
    expect(effectivePath({ ...bare, primary: dirB })).toBe(dirB)
    expect(effectivePath({ ...bare, folders: [] })).toBeUndefined()
  })
})

describe('bindWorkspaceId', () => {
  it('幂等覆写绑定且不影响其他字段', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    const first = bindWorkspaceId(data, 's', 'ws-1')
    expect(first.space.workspaceId).toBe('ws-1')
    const second = bindWorkspaceId(first.data, 's', 'ws-2')
    expect(second.space.workspaceId).toBe('ws-2')
    expect(second.space.primary).toBe(space.primary)
    expect(second.space.folders).toEqual(space.folders)
  })
})
