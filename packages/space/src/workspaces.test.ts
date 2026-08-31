// @env node
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from './locate.ts'
import { initSpace, mountProject } from './ops.ts'
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

let shell: string
let outside: string

beforeEach(async () => {
  shell = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-ws-shell-'))))!
  outside = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-ws-out-'))))!
})

afterEach(async () => {
  await rm(shell, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

function pathOf(ws: FakeRegistry, id: string): string {
  return ws.records.get(id)!.path
}

describe('registerOneSpace', () => {
  it('登记壳根与成员，成员按 space.yaml 顺序排在壳根之后、既有工作区之前', async () => {
    await initSpace(shell, '空间甲')
    await mountProject(shell, outside, { name: 'ext' })
    const innerReal = join(shell, 'projects', 'inner')
    await mkdir(innerReal, { recursive: true })
    // 手工补一个壳内成员（真实子目录）
    const { loadSpaceFile, saveSpaceFile } = await import('./space-file.ts')
    const file = await loadSpaceFile(shell)
    file.projects.push({ path: 'projects/inner', title: '内核' })
    await saveSpaceFile(shell, file)

    const ws = new FakeRegistry()
    const existing = await ws.create('/preexisting/dir')
    await registerOneSpace(ws as unknown as WorkspaceRegistry, shell, () => {})

    const paths = ws.order.map(id => pathOf(ws, id))
    expect(paths).toEqual([shell, outside, innerReal, '/preexisting/dir'])
    // title：壳根取空间名；成员取 space.yaml title 或壳内目录名（而非 realpath 名）
    expect(ws.records.get(ws.order[0]!)!.title).toBe('空间甲')
    expect(ws.records.get(ws.order[1]!)!.title).toBe('ext')
    expect(ws.records.get(ws.order[2]!)!.title).toBe('内核')
    expect(existing.id).toBe(ws.order[3]!)
  })

  it('成员目录缺失只跳过不报错', async () => {
    await initSpace(shell)
    const { loadSpaceFile, saveSpaceFile } = await import('./space-file.ts')
    const file = await loadSpaceFile(shell)
    file.projects.push({ path: 'projects/ghost' })
    await saveSpaceFile(shell, file)

    const logs: string[] = []
    const ws = new FakeRegistry()
    await registerOneSpace(ws as unknown as WorkspaceRegistry, shell, m => logs.push(m))
    expect(ws.order.map(id => pathOf(ws, id))).toEqual([shell])
    expect(logs.some(line => line.includes('projects/ghost'))).toBe(true)
  })

  it('重复登记返回既有项且不改动既有标题', async () => {
    await initSpace(shell, '空间甲')
    const ws = new FakeRegistry()
    await registerOneSpace(ws as unknown as WorkspaceRegistry, shell, () => {})
    // 用户在 UI 里改了标题（既有 workspace 的 title 不被覆盖）
    ws.records.get(ws.order[0]!)!.title = '用户改的名'
    await registerOneSpace(ws as unknown as WorkspaceRegistry, shell, () => {})
    expect(ws.records.size).toBe(1)
    expect(ws.records.get(ws.order[0]!)!.title).toBe('用户改的名')
  })

  it('symlink 成员按 realpath 登记，title 仍用壳内目录名', async () => {
    await initSpace(shell)
    const realTarget = join(outside, 'real-target')
    await mkdir(realTarget, { recursive: true })
    await symlink(realTarget, join(shell, 'projects', 'alias'), 'dir')
    const { loadSpaceFile, saveSpaceFile } = await import('./space-file.ts')
    const file = await loadSpaceFile(shell)
    file.projects.push({ path: 'projects/alias' })
    await saveSpaceFile(shell, file)

    const ws = new FakeRegistry()
    await registerOneSpace(ws as unknown as WorkspaceRegistry, shell, () => {})
    expect(pathOf(ws, ws.order[0]!)).toBe(shell)
    expect(pathOf(ws, ws.order[1]!)).toBe(realTarget)
    expect(ws.records.get(ws.order[1]!)!.title).toBe('alias')
  })
})
