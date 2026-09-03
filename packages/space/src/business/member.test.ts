import type { MemberData, SpaceData } from './types.ts'
import { lstat, mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { removeMemberData, removeMemberLink } from './member.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(): Promise<{ link: string, member: MemberData, workspace: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-space-member-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const memberPath = join(root, 'member')
  const link = join(workspace, 'projects', 'member')
  await Promise.all([mkdir(dirname(link), { recursive: true }), mkdir(memberPath)])
  return { workspace, link, member: { path: memberPath, mode: 'link', linkName: 'member' } }
}

describe('removeMemberLink', () => {
  it('removes matching absolute and relative links', async () => {
    const absolute = await fixture()
    await symlink(absolute.member.path, absolute.link, 'dir')
    await removeMemberLink(absolute.workspace, absolute.member)
    await expect(lstat(absolute.link)).rejects.toThrow()

    const relativeLink = await fixture()
    await symlink(relative(dirname(relativeLink.link), relativeLink.member.path), relativeLink.link, 'dir')
    await removeMemberLink(relativeLink.workspace, relativeLink.member)
    await expect(lstat(relativeLink.link)).rejects.toThrow()
  })

  it('removes a matching broken link without touching a link to another path', async () => {
    const broken = await fixture()
    await rm(broken.member.path, { recursive: true })
    await symlink(broken.member.path, broken.link, 'dir')
    await removeMemberLink(broken.workspace, broken.member)
    await expect(lstat(broken.link)).rejects.toThrow()

    const other = await fixture()
    const otherPath = join(dirname(other.member.path), 'other')
    await mkdir(otherPath)
    await symlink(otherPath, other.link, 'dir')
    await removeMemberLink(other.workspace, other.member)
    expect(await readlink(other.link)).toBe(otherPath)
  })
})

describe('removeMemberData', () => {
  it('removes primary when the last member is detached', () => {
    const member: MemberData = { path: '/member', mode: 'reference' }
    const space: SpaceData = { workspaceId: 'space', primary: member.path, members: [member] }

    const result = removeMemberData(space, member)

    expect(result).toEqual({ workspaceId: 'space', members: [] })
    expect('primary' in result).toBe(false)
  })
})
