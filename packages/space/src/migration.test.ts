// @env node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyEntry } from './migration.ts'
import { canonicalize } from './resolve.ts'

let shell: string
let member: string

beforeEach(async () => {
  shell = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-mig-shell-'))))!
  member = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-mig-member-'))))!
})

afterEach(async () => {
  for (const dir of [shell, member])
    await rm(dir, { recursive: true, force: true })
})

describe('migrateLegacyEntry', () => {
  it('壳根成为主成员，symlink 成员解析为真实路径并带入 title/desc', async () => {
    await mkdir(join(shell, 'projects'))
    await symlink(member, join(shell, 'projects', 'foo'), 'dir')
    await writeFile(join(shell, 'space.yaml'), [
      'version: 1',
      'name: 旧空间',
      'projects:',
      '  - path: projects/foo',
      '    title: Foo',
      '    desc: 主服务',
      '',
    ].join('\n'))

    const entity = await migrateLegacyEntry(shell)
    expect(entity?.name).toBe('旧空间')
    expect(entity?.primary).toBe(shell)
    expect(entity?.folders[0]?.path).toBe(shell)
    expect(entity?.folders[1]).toEqual({ path: member, title: 'Foo', desc: '主服务' })
  })

  it('没有 space.yaml 时退化为仅含壳根的空间', async () => {
    const entity = await migrateLegacyEntry(shell)
    expect(entity?.folders).toEqual([{ path: shell }])
    expect(entity?.primary).toBe(shell)
  })

  it('壳根已不存在时返回 undefined（由调用方丢弃）', async () => {
    expect(await migrateLegacyEntry(join(shell, 'gone'))).toBeUndefined()
  })

  it('成员 symlink 已失效时跳过该成员', async () => {
    await mkdir(join(shell, 'projects'))
    await symlink(join(shell, 'nonexistent-target'), join(shell, 'projects', 'dead'), 'dir')
    const entity = await migrateLegacyEntry(shell)
    expect(entity?.folders).toEqual([{ path: shell }])
  })
})
