// @env node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from './locate.ts'
import { doctorSpace, initSpace, listSpace, mountProject, setProjectDesc, unmountProject } from './ops.ts'

let shell: string
let outside: string

beforeEach(async () => {
  shell = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-shell-'))))!
  outside = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-outside-'))))!
})

afterEach(async () => {
  await rm(shell, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

async function initShell(name = '测试空间'): Promise<void> {
  await initSpace(shell, name)
}

/** clone 替身：只落目录与 .git 标记，不发起网络 */
async function fakeClone(root: string, url: string): Promise<void> {
  await mountProject(root, url, {}, async (args, cwd) => {
    await mkdir(join(cwd, args[2]!), { recursive: true })
    await writeFile(join(cwd, args[2]!, '.git'), '')
  })
}

describe('initSpace', () => {
  it('生成 space.yaml 与 projects/，缺省名取目录名', async () => {
    const file = await initSpace(shell)
    expect(file.name).toBe(shell.split('/').pop())
    expect(await canonicalize(join(shell, 'space.yaml'))).toBeTruthy()
    expect(await canonicalize(join(shell, 'projects', '.gitkeep'))).toBeTruthy()
  })

  it('重复 init 拒绝且不覆盖', async () => {
    await initShell('甲')
    await expect(initSpace(shell, '乙')).rejects.toThrow('已是多项目空间「甲」')
  })
})

describe('mountProject', () => {
  it('本机目录走 symlink，并可被盘点为 outside-shell', async () => {
    await initShell()
    const project = await mountProject(shell, outside, { name: 'ext' })
    expect(project.path).toBe('projects/ext')
    const [status] = await listSpace(shell)
    expect(status?.health).toBe('outside-shell')
    expect(status?.realPath).toBe(outside)
  })

  it('git URL 走 clone（execGit 注入替身）', async () => {
    await initShell()
    const calls: string[][] = []
    const project = await mountProject(shell, 'git@github.com:a/b.git', {}, async (args, cwd) => {
      calls.push(args)
      await mkdir(join(cwd, args[2]!), { recursive: true })
      await writeFile(join(cwd, args[2]!, '.git'), '')
    })
    expect(project.path).toBe('projects/b')
    expect(calls).toEqual([['clone', 'git@github.com:a/b.git', 'projects/b']])
    expect((await listSpace(shell))[0]?.health).toBe('ok')
  })

  it('重复挂载同一路径被拒绝', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await expect(mountProject(shell, outside, { name: 'ext' })).rejects.toThrow('已在空间中')
  })

  it('不存在的本机目录被拒绝', async () => {
    await initShell()
    await expect(mountProject(shell, join(outside, 'nope'))).rejects.toThrow('目录不存在')
  })

  it('title 显式传入才写入，缺省则不落字段', async () => {
    await initShell()
    const withTitle = await mountProject(shell, outside, { name: 'ext', title: '外围项目' })
    expect(withTitle.title).toBe('外围项目')
    expect((await listSpace(shell))[0]?.title).toBe('外围项目')
    await fakeClone(shell, 'git@github.com:a/plain.git')
    expect((await listSpace(shell)).find(p => p.path === 'projects/plain')?.title).toBeUndefined()
  })
})

describe('unmountProject / setProjectDesc', () => {
  it('unmount 只改 space.yaml，磁盘文件不动', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await unmountProject(shell, 'ext')
    expect(await listSpace(shell)).toEqual([])
    expect(await canonicalize(outside)).toBeTruthy()
  })

  it('setdesc 写入后可读，空串清除', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await setProjectDesc(shell, 'ext', '外围仓库')
    expect((await listSpace(shell))[0]?.desc).toBe('外围仓库')
    await setProjectDesc(shell, 'ext', '')
    expect((await listSpace(shell))[0]?.desc).toBeUndefined()
  })

  it('引用不存在的项目时报现有成员', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await expect(unmountProject(shell, 'nope')).rejects.toThrow('projects/ext')
  })
})

describe('listSpace / doctorSpace', () => {
  it('missing 成员被标出', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await rm(outside, { recursive: true })
    expect((await listSpace(shell))[0]?.health).toBe('missing')
  })

  it('danger-full-access 下壳外成员也可写', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    const report = await doctorSpace(shell, shell, 'danger-full-access')
    expect(report.projects[0]?.writable).toBe(true)
  })

  it('workspace-write 下壳外成员只读、壳内成员可写', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    await fakeClone(shell, 'git@github.com:a/inner.git')
    const report = await doctorSpace(shell, shell, 'workspace-write')
    expect(report.projects.find(p => p.path === 'projects/ext')?.writable).toBe(false)
    expect(report.projects.find(p => p.path === 'projects/inner')?.writable).toBe(true)
  })

  it('会话 cwd 在某个成员内时，其他成员不可写', async () => {
    await initShell()
    await fakeClone(shell, 'git@github.com:a/a.git')
    await fakeClone(shell, 'git@github.com:a/b.git')
    const report = await doctorSpace(shell, join(shell, 'projects', 'a'), 'workspace-write')
    expect(report.projects.find(p => p.path === 'projects/a')?.writable).toBe(true)
    expect(report.projects.find(p => p.path === 'projects/b')?.writable).toBe(false)
  })

  it('unknown 模式下可写性为 null 而非放行', async () => {
    await initShell()
    await mountProject(shell, outside, { name: 'ext' })
    const report = await doctorSpace(shell, shell, 'unknown')
    expect(report.projects[0]?.writable).toBeNull()
  })
})
