import { mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { finishPendingCreation, readPendingCreation, savePendingCreation, startPendingCreation } from './pending.ts'

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, rename: vi.fn(fs.rename) }
})

const roots: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function target(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-space-pending-'))
  roots.push(root)
  return join(root, 'demo')
}

describe('创建凭据', () => {
  it('首次发布不覆盖已有凭据', async () => {
    const path = await target()
    const pending = await startPendingCreation(path, 'space')
    await expect(startPendingCreation(path, 'space')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readPendingCreation(path, 'space')).toEqual(pending)
  })

  it('原子替换失败时保留上一版凭据并清理临时文件', async () => {
    const path = await target()
    const pending = await startPendingCreation(path, 'space')
    vi.mocked(rename).mockRejectedValueOnce(new Error('rename failed'))
    await expect(savePendingCreation(path, { ...pending, workspaceId: 'workspace' })).rejects.toThrow('rename failed')
    expect(await readPendingCreation(path, 'space')).toEqual(pending)
    expect(await readdir(roots[0]!)).toEqual(['.demo.dsh-space-pending.json'])
  })

  it('更新和完成只改变指定凭据', async () => {
    const path = await target()
    const pending = await startPendingCreation(path, 'chat', `${path}-10`)
    await savePendingCreation(path, { ...pending, workspaceId: 'workspace' })
    expect(await readPendingCreation(path, 'chat')).toEqual({ ...pending, workspaceId: 'workspace' })
    await finishPendingCreation(path)
    expect(await readPendingCreation(path, 'chat')).toBeUndefined()
  })
})
