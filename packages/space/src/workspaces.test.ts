// @env node
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { SpaceEntity } from './types.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachFolder, createSpace, setPrimary } from './ops.ts'
import { canonicalize } from './resolve.ts'
import { registerOneSpace } from './workspaces.ts'

/** 仿真核心 registry 的两个关键行为：create 前置新记录、同路径重复登记返回既有项 */
class FakeRegistry {
  order: string[] = []
  records = new Map<string, { path: string, title?: string }>()

  async create(path: string, title?: string): Promise<{ id: string }> {
    const existing = [...this.records.entries()].find(([, record]) => record.path === path)
    if (existing)
      return { id: existing[0] }
    const id = `ws-${this.records.size + 1}`
    this.records.set(id, title === undefined ? { path } : { path, title })
    this.order.unshift(id)
    return { id }
  }

  list(): { id: string }[] {
    return this.order.map(id => ({ id }))
  }

  async insertBefore(id: string, before?: string): Promise<string[]> {
    this.order = this.order.filter(item => item !== id)
    const at = before === undefined ? this.order.length : this.order.indexOf(before)
    this.order.splice(at === -1 ? this.order.length : at, 0, id)
    return [...this.order]
  }
}

let dirA: string
let dirB: string

beforeEach(async () => {
  dirA = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-ws-a-'))))!
  dirB = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-ws-b-'))))!
})

afterEach(async () => {
  for (const dir of [dirA, dirB])
    await rm(dir, { recursive: true, force: true })
})

describe('registerOneSpace', () => {
  it('主成员排首位，整块相邻，title 显式传入', async () => {
    let data: SpaceEntity[] = []
    data = (await createSpace(data, 's', dirA)).data
    data = (await attachFolder(data, 's', dirB, { title: 'B 服务' })).data
    // 把 B 设为主成员：登记时它应排在最前
    const { data: d2 } = await setPrimary(data, 's', 'B 服务')

    const ws = new FakeRegistry()
    const existing = await ws.create('/preexisting/dir')
    await registerOneSpace(ws as unknown as WorkspaceRegistry, d2[0]!, () => {})

    const paths = ws.order.map(id => ws.records.get(id)!.path)
    expect(paths).toEqual([dirB, dirA, '/preexisting/dir'])
    expect(ws.records.get(ws.order[0]!)!.title).toBe('B 服务')
    expect(ws.records.get(ws.order[1]!)!.title).toBe(dirA.split('/').pop())
    expect(existing.id).toBe(ws.order[2]!)
  })

  it('成员目录缺失只跳过不报错', async () => {
    const { data: created } = await createSpace([], 's', dirA)
    const { data } = await attachFolder(created, 's', dirB)
    await rm(dirB, { recursive: true, force: true })

    const logs: string[] = []
    const ws = new FakeRegistry()
    await registerOneSpace(ws as unknown as WorkspaceRegistry, data[0]!, m => logs.push(m))
    expect(ws.order.map(id => ws.records.get(id)!.path)).toEqual([dirA])
    expect(logs.some(line => line.includes(dirB))).toBe(true)
  })

  it('重复登记返回既有项且不改动既有标题', async () => {
    const { data } = await createSpace([], 's', dirA)
    const ws = new FakeRegistry()
    await registerOneSpace(ws as unknown as WorkspaceRegistry, data[0]!, () => {})
    // 用户在 UI 里改了标题（既有 workspace 的 title 不被覆盖）
    ws.records.get(ws.order[0]!)!.title = '用户改的名'
    await registerOneSpace(ws as unknown as WorkspaceRegistry, data[0]!, () => {})
    expect(ws.records.size).toBe(1)
    expect(ws.records.get(ws.order[0]!)!.title).toBe('用户改的名')
  })
})
