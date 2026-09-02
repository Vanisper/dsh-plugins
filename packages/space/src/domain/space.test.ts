import type { SpaceEntity } from './types.ts'
import { lstat, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { attachFolder, createSpaceEntity, detachFolder, dropSpace, findFolder, findSpace, listFolders, replaceWorkspaceId, setFolderDesc, setFolderTitle, setPrimary } from './space.ts'

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

async function createFixture(data: SpaceEntity[] = [], name = 's'): Promise<ReturnType<typeof createSpaceEntity>> {
  const shellPath = join(root, 'spaces', name)
  await mkdir(join(shellPath, 'projects'), { recursive: true })
  const shell = (await canonicalize(shellPath))!
  return createSpaceEntity(data, name, shell, `ws-${name}`)
}

describe('createSpaceEntity', () => {
  it('只建立满足固定壳与核心绑定不变量的实体', async () => {
    const { space } = await createFixture([], '我的工作区')
    expect(space).toMatchObject({ name: '我的工作区', shell: join(root, 'spaces', '我的工作区'), workspaceId: 'ws-我的工作区', folders: [] })
  })

  it('拒绝重名与非法名称，允许连字符', async () => {
    const first = await createFixture([], 'my-space')
    expect(() => createSpaceEntity(first.data, 'my-space', '/tmp/other', 'ws-other')).toThrow('已存在')
    expect(() => createSpaceEntity([], 'a/b', '/tmp/shell', 'ws')).toThrow('非法字符')
  })
})

describe('attachFolder', () => {
  it('默认 reference 不动磁盘；显式 link 建 symlink', async () => {
    let { data } = await createFixture()
    const referenced = await attachFolder(data, 's', dirA)
    expect(referenced.folder).toMatchObject({ path: dirA, mode: 'reference' })
    expect(referenced.folder.linkPath).toBeUndefined()

    data = referenced.data
    const linked = await attachFolder(data, 's', dirB, { mode: 'link' })
    expect((await lstat(linked.folder.linkPath!)).isSymbolicLink()).toBe(true)
  })

  it('link 重试可复用同目标 symlink，但拒绝同名异目标与路径逃逸', async () => {
    const { data } = await createFixture()
    const first = await attachFolder(data, 's', dirA, { mode: 'link', name: 'member' })
    await expect(attachFolder(data, 's', dirA, { mode: 'link', name: 'member' })).resolves.toMatchObject({ folder: { path: dirA } })
    await expect(attachFolder(first.data, 's', dirB, { mode: 'link', name: 'member' })).rejects.toThrow('同名链接')
    await expect(attachFolder(data, 's', dirB, { mode: 'link', name: '../escape' })).rejects.toThrow('安全的单段名称')
  })

  it('reference 模式拒绝无意义的链接名', async () => {
    const { data } = await createFixture()
    await expect(attachFolder(data, 's', dirA, { name: 'unused' })).rejects.toThrow('只用于 link')
  })

  it('同空间同路径重复被拒，跨空间允许', async () => {
    const first = await createFixture()
    const attached = await attachFolder(first.data, 's', dirA)
    await expect(attachFolder(attached.data, 's', dirA)).rejects.toThrow('无需重复挂入')
    const second = await createFixture(attached.data, 's2')
    await expect(attachFolder(second.data, 's2', dirA)).resolves.toBeTruthy()
  })

  it('目录名引用歧义时要求完整路径', async () => {
    const sameA = join(root, 'members', 'a', 'same')
    const sameB = join(root, 'members', 'b', 'same')
    await mkdir(sameA, { recursive: true })
    await mkdir(sameB, { recursive: true })
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', sameA)).data
    data = (await attachFolder(data, 's', sameB)).data
    await expect(findFolder(findSpace(data, 's'), 'same')).rejects.toThrow('命中多个目录')
  })

  it('title 不得与既有成员的路径、目录名或 title 冲突', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA)).data
    await expect(attachFolder(data, 's', dirB, { title: basename(dirA) })).rejects.toThrow('冲突')
  })
})

describe('detachFolder', () => {
  it('link 成员连带删除壳内 symlink，真实目录不动', async () => {
    let { data } = await createFixture()
    const attached = await attachFolder(data, 's', dirA, { mode: 'link' })
    data = attached.data
    const result = await detachFolder(data, 's', dirA)
    expect(await canonicalize(attached.folder.linkPath!)).toBeUndefined()
    expect(await canonicalize(dirA)).toBe(dirA)
    expect(result.space.folders).toEqual([])
  })

  it('拒绝删除注册表伪造的壳外 linkPath', async () => {
    const fixture = await createFixture()
    const space: SpaceEntity = { ...fixture.space, primary: dirA, folders: [{ path: dirA, mode: 'link', linkPath: dirB }] }
    await expect(detachFolder([space], 's', dirA)).rejects.toThrow('拒绝删除壳外链接')
    expect(await canonicalize(dirB)).toBe(dirB)
  })

  it('摘除主成员时回退为剩余首位', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA)).data
    data = (await attachFolder(data, 's', dirB)).data
    expect((await detachFolder(data, 's', dirA)).space.primary).toBe(dirB)
  })
})

describe('成员元数据', () => {
  it('primary 是纯字段，不改变成员顺序、壳目录或核心绑定', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA)).data
    data = (await attachFolder(data, 's', dirB)).data
    const before = findSpace(data, 's')
    const result = await setPrimary(data, 's', dirB)
    expect(result.space.primary).toBe(dirB)
    expect(result.space.folders.map(folder => folder.path)).toEqual([dirA, dirB])
    expect(result.space.shell).toBe(before.shell)
    expect(result.space.workspaceId).toBe(before.workspaceId)
  })

  it('title/desc 可设置与清除', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA)).data
    data = (await setFolderTitle(data, 's', dirA, '前端仓库')).data
    data = (await setFolderDesc(data, 's', '前端仓库', '日常开发')).data
    expect(findSpace(data, 's').folders[0]).toMatchObject({ title: '前端仓库', desc: '日常开发' })
    data = (await setFolderTitle(data, 's', dirA, '')).data
    data = (await setFolderDesc(data, 's', dirA, '')).data
    expect(findSpace(data, 's').folders[0]).not.toHaveProperty('title')
    expect(findSpace(data, 's').folders[0]).not.toHaveProperty('desc')
  })

  it('显式修复核心绑定不影响其他字段', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA)).data
    const before = findSpace(data, 's')
    const result = replaceWorkspaceId(data, 's', 'ws-new')
    expect(result.space.workspaceId).toBe('ws-new')
    expect(result.space.shell).toBe(before.shell)
    expect(result.space.folders).toEqual(before.folders)
  })
})

describe('盘点与删除', () => {
  it('报告成员与 link 健康度', async () => {
    let { data } = await createFixture()
    data = (await attachFolder(data, 's', dirA, { mode: 'link' })).data
    data = (await attachFolder(data, 's', dirB)).data
    const space = findSpace(data, 's')
    expect((await listFolders(space)).map(item => item.linkHealth)).toEqual(['ok', 'none'])
    await rm(space.folders[0]!.linkPath!)
    expect((await listFolders(space))[0]?.linkHealth).toBe('broken')
  })

  it('dropSpace 只删附加记录，壳目录不动', async () => {
    const { data, space } = await createFixture()
    expect(dropSpace(data, 's').data).toEqual([])
    expect(await canonicalize(space.shell)).toBe(space.shell)
  })
})
