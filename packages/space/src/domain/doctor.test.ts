import type { ChatEntity, SpaceEntity } from './types.ts'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { auditBinding, auditChat, doctorSpace } from './doctor.ts'

let root: string
let shell: string
let member: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-doctor-'))))!
  shell = join(root, 'shell')
  member = join(root, 'member')
  await mkdir(shell)
  await mkdir(member)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function spaceOf(id = 'sp', overrides: Partial<SpaceEntity> = {}): SpaceEntity {
  return { id, name: id, shell, workspaceId: `ws-${id}`, primary: member, folders: [{ path: member, mode: 'reference' }], ...overrides }
}

describe('doctorSpace', () => {
  it('按沙盒模式报告成员可写性', async () => {
    expect((await doctorSpace(spaceOf(), shell, 'danger-full-access')).folders[0]?.writability).toBe('writable')
    expect((await doctorSpace(spaceOf(), shell, 'workspace-write')).folders[0]?.writability).toBe('read-only')
    expect((await doctorSpace(spaceOf(), member, 'workspace-write')).folders[0]?.writability).toBe('writable')
    expect((await doctorSpace(spaceOf(), member, 'unknown')).folders[0]?.writability).toBeNull()
  })

  it('壳目录消失时报 missing', async () => {
    const space = spaceOf()
    await rm(shell, { recursive: true, force: true })
    expect((await doctorSpace(space, member, 'unknown')).shellHealth).toBe('missing')
  })
})

describe('auditBinding', () => {
  it('区分核心不可用、悬空与错位', () => {
    const space = spaceOf()
    expect(auditBinding(space, undefined, [space]).status).toBe('unknown')
    expect(auditBinding(space, [], [space]).status).toBe('dangling')
    expect(auditBinding(space, [{ id: space.workspaceId, path: member }], [space]).status).toBe('mismatch')
  })

  it('报告共享核心行与共享壳目录', () => {
    const first = spaceOf('first', { workspaceId: 'ws-shared' })
    const second = spaceOf('second', { workspaceId: 'ws-shared', shell: join(root, 'other-shell') })
    expect(auditBinding(second, [{ id: 'ws-shared', path: second.shell }], [first, second]).status).toBe('shared-row')

    const twin = spaceOf('twin', { workspaceId: 'ws-twin' })
    expect(auditBinding(twin, [{ id: 'ws-twin', path: shell }], [first, twin]).status).toBe('shared-path')
  })

  it('id 与壳目录都一致时为 ok', () => {
    const space = spaceOf()
    expect(auditBinding(space, [{ id: space.workspaceId, path: shell }], [space]).status).toBe('ok')
  })
})

describe('auditChat', () => {
  it('区分目录缺失、核心不可用、悬空、错位与健康', async () => {
    const chatPath = join(root, 'chat')
    await mkdir(chatPath)
    const chat: ChatEntity = { path: chatPath, workspaceId: 'ws-chat' }
    expect((await auditChat(chat, undefined)).status).toBe('unknown')
    expect((await auditChat(chat, [])).status).toBe('dangling')
    expect((await auditChat(chat, [{ id: 'ws-chat', path: member }])).status).toBe('mismatch')
    expect((await auditChat(chat, [{ id: 'ws-chat', path: chatPath }])).status).toBe('ok')
    await rm(chatPath, { recursive: true, force: true })
    expect((await auditChat(chat, [])).status).toBe('missing-dir')
  })
})
