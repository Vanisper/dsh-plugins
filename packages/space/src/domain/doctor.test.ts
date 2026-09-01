import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { createChat } from './chats.ts'
import { auditBinding, auditChat, doctorSpace } from './doctor.ts'
import { bindWorkspaceId, createSpace } from './space.ts'

let root: string
let dirA: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-doc-root-'))))!
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-doc-a-'))))!
})

afterEach(async () => {
  for (const dir of [root, dirA])
    await rm(dir, { recursive: true, force: true })
})

describe('doctorSpace', () => {
  it('danger-full-access 下全部可写', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    const report = await doctorSpace(space, dirA, 'danger-full-access')
    expect(report.folders[0]?.writability).toBe('writable')
  })

  it('workspace-write：cwd 覆盖成员才可写；cwd 在成员内部为部分可写', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    const fromMember = await doctorSpace(space, dirA, 'workspace-write')
    expect(fromMember.folders[0]?.writability).toBe('writable')

    const sub = join(dirA, 'sub')
    await mkdir(sub)
    const fromSub = await doctorSpace(space, sub, 'workspace-write')
    expect(fromSub.folders[0]?.writability).toBe('partial')

    const fromElsewhere = await doctorSpace(space, root, 'workspace-write')
    expect(fromElsewhere.folders[0]?.writability).toBe('read-only')
  })

  it('unknown 模式下可达性为 null 而非放行', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    const report = await doctorSpace(space, dirA, 'unknown')
    expect(report.folders[0]?.writability).toBeNull()
  })

  it('壳健康：正常建壳为 ok', async () => {
    const { space } = await createSpace([], 's', root, dirA)
    expect((await doctorSpace(space, dirA, 'unknown')).shellHealth).toBe('ok')
  })
})

describe('auditBinding（只读检测，不治愈）', () => {
  it('未绑定（C）：无 workspaceId 时报告缺失，不误报其他', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    expect(auditBinding(space, [], data).status).toBe('unbound')
  })

  it('核心服务不可用时整体降级为 unknown', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    expect(auditBinding(space, undefined, data).status).toBe('unknown')
  })

  it('悬空（A）：绑定的行在核心注册表快照中不存在', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    const bound = bindWorkspaceId(data, space.name, 'ws-gone')
    expect(auditBinding(bound.space, [], bound.data).status).toBe('dangling')
  })

  it('错位（B）：行在但 path 与有效路径不符', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    const bound = bindWorkspaceId(data, space.name, 'ws-other')
    expect(auditBinding(bound.space, [{ id: 'ws-other', path: '/somewhere/else' }], bound.data).status).toBe('mismatch')
  })

  it('共享行（E）：两空间绑定同一行 id', async () => {
    const first = await createSpace([], 's1', root, dirA)
    const second = await createSpace(first.data, 's2', root, dirA)
    const bound1 = bindWorkspaceId(second.data, 's1', 'ws-shared')
    const bound2 = bindWorkspaceId(bound1.data, 's2', 'ws-shared')
    const row = [{ id: 'ws-shared', path: bound2.data[0]!.shell! }]
    expect(auditBinding(bound2.data[0]!, row, bound2.data).status).toBe('shared-row')
  })

  it('共享路径（E）：两空间有效路径相同（即使都未绑定）', async () => {
    const space = { id: 'sp-1', name: '甲', primary: dirA, folders: [{ path: dirA, mode: 'reference' as const }] }
    const twin = { id: 'sp-2', name: '乙', primary: dirA, folders: [{ path: dirA, mode: 'reference' as const }] }
    expect(auditBinding(twin, [], [space, twin]).status).toBe('shared-path')
  })

  it('一致绑定为 ok', async () => {
    const { data, space } = await createSpace([], 's', root, dirA)
    const bound = bindWorkspaceId(data, space.name, 'ws-ok')
    const audit = auditBinding(bound.space, [{ id: 'ws-ok', path: space.shell! }], bound.data)
    expect(audit.status).toBe('ok')
    expect(audit.row?.path).toBe(space.shell)
  })
})

describe('auditChat（对话实体健康）', () => {
  it('目录消失报 missing-dir（优先于绑定判定）', async () => {
    const { chat } = await createChat([], root, 'gone')
    await rm(chat.path, { recursive: true, force: true })
    expect((await auditChat(chat, [])).status).toBe('missing-dir')
  })

  it('无绑定报 unbound；绑定悬空报 dangling；行在为 ok', async () => {
    const { chat } = await createChat([], root, 'x')
    expect((await auditChat(chat, [])).status).toBe('unbound')
    const bound: typeof chat = { ...chat, workspaceId: 'ws-gone' }
    expect((await auditChat(bound, [{ id: 'ws-ok', path: chat.path }])).status).toBe('dangling')
    const ok: typeof chat = { ...chat, workspaceId: 'ws-ok' }
    expect((await auditChat(ok, [{ id: 'ws-ok', path: chat.path }])).status).toBe('ok')
  })

  it('核心服务不可用时报 unbound 口径', async () => {
    const { chat } = await createChat([], root, 'x')
    expect((await auditChat(chat, undefined)).status).toBe('unbound')
  })
})
