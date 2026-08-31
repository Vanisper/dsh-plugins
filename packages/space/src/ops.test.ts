// @env node
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachFolder, createSpace, detachFolder, doctorSpace, findSpace, setFolderDesc, setFolderTitle, setPrimary } from './ops.ts'
import { canonicalize } from './resolve.ts'

let dirA: string
let dirB: string
let dirC: string

beforeEach(async () => {
  // tmpdir 必然存在，canonicalize 不会返回 undefined
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-a-'))))!
  dirB = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-b-'))))!
  dirC = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-c-'))))!
})

afterEach(async () => {
  for (const dir of [dirA, dirB, dirC])
    await rm(dir, { recursive: true, force: true })
})

describe('createSpace', () => {
  it('创建空空间', async () => {
    const { data, space } = await createSpace([], '  我的空间  ')
    expect(space.name).toBe('我的空间')
    expect(space.folders).toEqual([])
    expect(space.primary).toBeUndefined()
    expect(data).toHaveLength(1)
  })

  it('带首个文件夹创建：自动成为主成员', async () => {
    const { space } = await createSpace([], 's', dirA)
    expect(space.folders[0]?.path).toBe(dirA)
    expect(space.primary).toBe(dirA)
  })

  it('重名与空名被拒绝', async () => {
    const { data } = await createSpace([], 's')
    await expect(createSpace(data, 's')).rejects.toThrow('已存在')
    await expect(createSpace([], '   ')).rejects.toThrow('不能为空')
  })

  it('首个文件夹不存在时拒绝且不落数据', async () => {
    await expect(createSpace([], 's', join(dirA, 'nope'))).rejects.toThrow('目录不存在')
  })
})

describe('attachFolder', () => {
  it('原地引用：只登记规范路径', async () => {
    const { data } = await createSpace([], 's', dirA)
    const result = await attachFolder(data, 's', dirB, { title: 'B 服务', desc: '负责 x' })
    expect(result.folder).toEqual({ path: dirB, title: 'B 服务', desc: '负责 x' })
    expect(result.space.primary).toBe(dirA)
  })

  it('一个文件夹全局只能属于一个空间', async () => {
    const { data: d1 } = await createSpace([], 's1', dirA)
    const { data: d2 } = await createSpace(d1, 's2')
    await expect(attachFolder(d2, 's2', dirA)).rejects.toThrow('已是空间「s1」的成员')
  })

  it('title 撞其他成员身份键被拒绝', async () => {
    const { data } = await createSpace([], 's', dirA)
    await expect(attachFolder(data, 's', dirB, { title: basenameOf(dirA) })).rejects.toThrow('冲突')
  })

  it('不存在的目录被拒绝', async () => {
    const { data } = await createSpace([], 's')
    await expect(attachFolder(data, 's', join(dirA, 'nope'))).rejects.toThrow('目录不存在')
  })
})

describe('detachFolder / setPrimary', () => {
  it('摘除不动磁盘；摘除主成员时回退为剩余首位', async () => {
    let { data } = await createSpace([], 's', dirA)
    data = (await attachFolder(data, 's', dirB)).data
    const result = await detachFolder(data, 's', dirA)
    expect(result.space.folders.map(f => f.path)).toEqual([dirB])
    expect(result.space.primary).toBe(dirB)
    expect(await canonicalize(dirA)).toBeTruthy()
  })

  it('成员引用支持路径、title、目录名', async () => {
    let { data } = await createSpace([], 's', dirA)
    data = (await attachFolder(data, 's', dirB, { title: 'B' })).data
    expect((await setPrimary(data, 's', 'B')).space.primary).toBe(dirB)
    expect((await setPrimary(data, 's', basenameOf(dirA))).space.primary).toBe(dirA)
    expect((await setPrimary(data, 's', dirB)).space.primary).toBe(dirB)
  })
})

describe('setFolderTitle / setFolderDesc', () => {
  it('设置与清除', async () => {
    let { data } = await createSpace([], 's', dirA)
    data = (await setFolderTitle(data, 's', dirA, '甲')).data
    data = (await setFolderDesc(data, 's', dirA, '说明')).data
    const space = findSpace(data, 's')
    expect(space.folders[0]).toEqual({ path: dirA, title: '甲', desc: '说明' })
    data = (await setFolderTitle(data, 's', dirA, '')).data
    data = (await setFolderDesc(data, 's', dirA, '')).data
    expect(findSpace(data, 's').folders[0]).toEqual({ path: dirA })
  })

  it('title 撞车被拒绝', async () => {
    let { data } = await createSpace([], 's', dirA)
    data = (await attachFolder(data, 's', dirB, { title: 'B' })).data
    await expect(setFolderTitle(data, 's', dirA, 'B')).rejects.toThrow('冲突')
  })
})

describe('doctorSpace', () => {
  it('danger-full-access 下全部可写', async () => {
    const { space } = await createSpace([], 's', dirA)
    const report = await doctorSpace(space, dirA, 'danger-full-access')
    expect(report.folders[0]?.writability).toBe('writable')
  })

  it('workspace-write：cwd 覆盖成员才可写；cwd 在成员内部为部分可写', async () => {
    let { data } = await createSpace([], 's', dirA)
    data = (await attachFolder(data, 's', dirB)).data
    const space = findSpace(data, 's')

    const fromA = await doctorSpace(space, dirA, 'workspace-write')
    expect(fromA.folders.find(f => f.path === dirA)?.writability).toBe('writable')
    expect(fromA.folders.find(f => f.path === dirB)?.writability).toBe('read-only')

    const subOfB = join(dirB, 'sub')
    await mkdir(subOfB)
    const fromSubB = await doctorSpace(space, subOfB, 'workspace-write')
    expect(fromSubB.folders.find(f => f.path === dirB)?.writability).toBe('partial')
  })

  it('unknown 模式下可达性为 null 而非放行', async () => {
    const { space } = await createSpace([], 's', dirA)
    const report = await doctorSpace(space, dirA, 'unknown')
    expect(report.folders[0]?.writability).toBeNull()
  })

  it('缺失目录报 missing', async () => {
    const { space } = await createSpace([], 's', dirA)
    await rm(dirA, { recursive: true, force: true })
    const report = await doctorSpace(space, dirC, 'danger-full-access')
    expect(report.folders[0]?.health).toBe('missing')
    expect(report.folders[0]?.writability).toBe('read-only')
  })
})

function basenameOf(path: string): string {
  return path.split('/').pop()!
}
