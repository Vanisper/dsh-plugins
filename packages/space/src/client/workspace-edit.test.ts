import type { RegistryItem, RegistryPayload } from './types.ts'
import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceEdit } from './workspace-edit.ts'

function setup(kind: 'space' | 'plain' = 'space') {
  let current: RegistryItem = { kind, workspaceId: 'w', path: '/workspace', title: '项目', sessionIds: ['s'], ...(kind === 'space' ? { members: [{ path: '/a', mode: 'reference' as const }], primary: '/a', revision: 'v1' } : {}) }
  const original = structuredClone(current)
  const read = vi.fn(async (): Promise<RegistryPayload> => ({ ok: true, root: '/root', items: [current], invalidChats: [], invalidSpaces: [] }))
  const run = vi.fn(async (input: Record<string, unknown>) => {
    if (input.op === 'drop-space') {
      current = { kind: 'plain', workspaceId: current.workspaceId, path: current.path, title: current.title, sessionIds: current.sessionIds }
      return { dropped: current.workspaceId }
    }
    current = { ...current, kind: 'space', members: structuredClone(input.members) as RegistryItem['members'], primary: input.primary as string | undefined, revision: 'v2' }
    return { space: structuredClone(current) }
  })
  const rename = vi.fn(async (_: string, title: string) => {
    current = { ...current, title }
  })
  const accepted = vi.fn()
  const edit = createWorkspaceEdit(original, { read, run, rename, accepted })
  const draft = { title: '新名称', space: true, members: [{ path: '/b', mode: 'reference' as const }], primary: '/b' }
  return { edit, original, draft, read, run, rename, accepted, current: () => current, update: (next: Partial<RegistryItem>) => {
    current = { ...current, ...next }
  } }
}

describe('工作区编辑分步保存', () => {
  it('编辑内关闭空间化，保留草稿成员但只提交带版本的降级', async () => {
    const h = setup()
    h.rename.mockRejectedValueOnce(new Error('改名离线'))
    await expect(h.edit.save({ ...h.draft, space: false })).rejects.toThrow('已完成的修改已保留')
    expect(h.run).toHaveBeenCalledWith({ op: 'drop-space', workspace: 'w', expectedRevision: 'v1' })
    expect(h.edit.snapshot().item.kind).toBe('plain')
    await h.edit.save({ ...h.draft, space: false })
    expect(h.run).toHaveBeenCalledOnce()
    expect(h.current().title).toBe('新名称')
  })
  it('成员先保存，随后改名；完整保留身份、路径和会话', async () => {
    const h = setup()
    await h.edit.save(h.draft)
    expect(h.run).toHaveBeenCalledWith({ op: 'save-members', workspace: 'w', members: h.draft.members, primary: '/b', expectedRevision: 'v1' })
    expect(h.run.mock.invocationCallOrder[0]).toBeLessThan(h.rename.mock.invocationCallOrder[0]!)
    expect(h.current()).toMatchObject({ workspaceId: 'w', path: '/workspace', sessionIds: ['s'], title: '新名称' })
    expect(h.edit.snapshot().saved).toBe(true)
  })

  it('成员失败时不提交名称，原草稿仍可再次保存', async () => {
    const h = setup()
    h.run.mockRejectedValueOnce(new Error('链接冲突'))
    await expect(h.edit.save(h.draft)).rejects.toThrow('链接冲突')
    expect(h.rename).not.toHaveBeenCalled()
    expect(h.edit.snapshot().item).toEqual(h.original)
    await h.edit.save(h.draft)
    expect(h.rename).toHaveBeenCalledOnce()
  })

  it('成员成功而改名失败，重试只提交名称', async () => {
    const h = setup()
    h.rename.mockRejectedValueOnce(new Error('改名离线'))
    await expect(h.edit.save(h.draft)).rejects.toThrow('已完成的修改已保留')
    expect(h.edit.snapshot().item.revision).toBe('v2')
    await h.edit.save(h.draft)
    expect(h.run).toHaveBeenCalledOnce()
    expect(h.rename).toHaveBeenCalledTimes(2)
  })

  it('成员响应丢失但读回匹配，不重复保存', async () => {
    const h = setup()
    h.run.mockImplementationOnce(async () => {
      h.update({ members: h.draft.members, primary: '/b', revision: 'v2' })
      throw new Error('连接中断')
    })
    await h.edit.save(h.draft)
    expect(h.run).toHaveBeenCalledOnce()
    expect(h.rename).toHaveBeenCalledOnce()
  })

  it('改名响应丢失但读回匹配，确认成功', async () => {
    const h = setup()
    h.rename.mockImplementationOnce(async (_, title) => {
      h.update({ title })
      throw new Error('连接中断')
    })
    await h.edit.save(h.draft)
    expect(h.edit.snapshot().item.title).toBe('新名称')
  })

  it.each(['title', 'revision'] as const)('其他页面修改 %s 后拒绝覆盖', async (key) => {
    const h = setup()
    h.update({ [key]: '其他修改' })
    await expect(h.edit.save(h.draft)).rejects.toThrow('其他位置修改')
    expect(h.run).not.toHaveBeenCalled()
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('成员保存期间发生其他改名，保留成员结果但不覆盖名称', async () => {
    const h = setup()
    h.run.mockImplementationOnce(async () => {
      h.update({ members: h.draft.members, primary: '/b', revision: 'v2', title: '其他页面' })
      return { space: h.current() }
    })
    await expect(h.edit.save(h.draft)).rejects.toThrow('名称已在其他位置修改')
    expect(h.rename).not.toHaveBeenCalled()
    expect(h.edit.snapshot().saved).toBe(true)
  })

  it('仅改名时不覆盖其他页面的成员更新', async () => {
    const h = setup()
    h.update({ members: h.draft.members, primary: '/b', revision: 'v2' })
    await h.edit.save({ ...h.draft, members: h.original.members!, primary: h.original.primary })
    expect(h.run).not.toHaveBeenCalled()
    expect(h.edit.snapshot().item.primary).toBe('/b')
  })

  it('普通目录只改名不会增强，显式增强将整份成员一起提交', async () => {
    const h = setup('plain')
    await h.edit.save({ title: '新名称', space: false, members: [] })
    expect(h.run).not.toHaveBeenCalled()
    await h.edit.save(h.draft)
    expect(h.run).toHaveBeenCalledWith({ op: 'enhance-space', workspace: 'w', members: h.draft.members, primary: '/b' })
    expect(h.rename).toHaveBeenCalledOnce()
  })

  it('名称为空拒绝保存，关闭空间时忽略保留在草稿中的成员输入', async () => {
    const h = setup('plain')
    await expect(h.edit.save({ ...h.draft, title: ' ' })).rejects.toThrow('不能为空')
    await h.edit.save({ ...h.draft, title: h.original.title, space: false })
    expect(h.run).not.toHaveBeenCalled()
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('结果未知时不假定成功；后续重试读回确认后继续', async () => {
    const h = setup()
    h.run.mockImplementationOnce(async () => {
      h.update({ members: h.draft.members, primary: '/b', revision: 'v2' })
      h.read.mockRejectedValueOnce(new Error('离线'))
      throw new Error('结果未知')
    })
    await expect(h.edit.save(h.draft)).rejects.toThrow('结果未知')
    expect(h.rename).not.toHaveBeenCalled()
    await h.edit.save(h.draft)
    expect(h.run).toHaveBeenCalledOnce()
    expect(h.rename).toHaveBeenCalledOnce()
  })

  it('登记消失或路径变化拒绝写入，读取失败也不猜测降级', async () => {
    const h = setup()
    h.update({ path: '/different' })
    await expect(h.edit.save(h.draft)).rejects.toThrow('登记或描述已变化')
    h.read.mockRejectedValueOnce(new Error('离线'))
    await expect(h.edit.save(h.draft)).rejects.toThrow('离线')
    expect(h.run).not.toHaveBeenCalled()
  })
})
