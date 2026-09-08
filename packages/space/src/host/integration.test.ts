import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { workspaceDomainState, workspaceRecord, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it } from 'vitest'
import plugin from '../index.ts'

interface Route {
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

const cleanups: Array<() => Promise<unknown>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
})

async function host() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-space-host-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  const routes = new Map<string, Route>()
  const commands = new Map<string, CommandDefinition>()
  const tools = new Map<string, { name: string, execute: (args: Record<string, string>) => Promise<unknown> }>()
  const prompts = new Map<string, { name: string, text: (context: unknown) => string }>()
  const rows = new Map<string, ReturnType<typeof workspaceRecord.parse>>()
  let state = workspaceDomainState.parse({ initialized: false, workspaceIds: [] })
  let document: Record<string, unknown> = { 'dsh-space': { root, spaces: [], chats: [] } }
  const headers: Array<{ id: string, cwd: string, createdAt: number }> = []
  let failSettings = false
  let domainCloses = 0

  class MemorySettings extends SettingsProvider {
    readonly writable = true
    protected async load() { return document }
    protected async persist(ns: SettingsNamespace, section: Record<string, unknown>) {
      if (failSettings) {
        failSettings = false
        throw new Error('settings unavailable')
      }
      document = { ...document, [ns]: structuredClone(section) }
    }
  }

  function register<T extends { name: string }>(entries: Map<string, T>, value: T): () => void {
    if (entries.has(value.name))
      throw new Error(`duplicate registration: ${value.name}`)
    entries.set(value.name, value)
    return () => {
      entries.delete(value.name)
    }
  }

  // 只替换持久化介质和入口收集器，Workspace 和 Settings 使用官方服务及其生命周期
  const providers = await ctx.plugin((ctx: Context) => {
    ctx.provide('storageDomain', { open: async () => ({
      global: { get: () => structuredClone(state), set: async (next: typeof state) => { state = workspaceDomainState.parse(next) } },
      table: () => ({
        get size() { return rows.size },
        get: (id: string) => rows.get(id),
        keys: () => rows.keys(),
        entries: () => rows.entries(),
        put: async (id: string, row: unknown) => { rows.set(id, workspaceRecord.parse(row)) },
        delete: async (id: string) => rows.delete(id),
        update: async (id: string, update: (row: unknown) => unknown) => {
          const next = workspaceRecord.parse(update(rows.get(id)))
          rows.set(id, next)
          return next
        },
      }),
      close: async () => { domainCloses++ },
    }) })
    ctx.provide('sessionPersistence', { list: async () => headers })
    ctx.provide('commands', { register: (value: CommandDefinition) => register(commands, value) })
    ctx.provide('tools', { register: (value: Parameters<typeof tools.set>[1]) => register(tools, value) })
    ctx.provide('systemPrompt', { context: (value: Parameters<typeof prompts.set>[1]) => register(prompts, value) })
    ctx.provide('webServer', { register: (route: Route) => {
      if (routes.has(route.path))
        throw new Error(`duplicate route: ${route.path}`)
      routes.set(route.path, route)
      return () => {
        routes.delete(route.path)
      }
    } })
  })
  cleanups.push(() => providers.dispose())
  const settingsFiber = await ctx.plugin(MemorySettings)
  cleanups.push(() => settingsFiber.dispose())
  const workspaceFiber = await ctx.plugin(WorkspaceRegistry)
  cleanups.push(() => workspaceFiber.dispose())
  const fiber = await ctx.plugin(plugin)
  cleanups.push(() => fiber.dispose())
  const server = createServer((req, res) => {
    const route = routes.get(req.url ?? '')
    if (!route) {
      res.writeHead(404).end()
      return
    }
    Promise.resolve(route.handler(req, res)).catch(() => res.writeHead(500).end())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  cleanups.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const url = `http://127.0.0.1:${address.port}/api/dsh-space`
  const request = async (body: unknown) => {
    const response = await fetch(`${url}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  return { ctx, root, fiber, workspaceFiber, routes, commands, tools, prompts, headers, url, request, failSettings: () => {
    failSettings = true
  }, domainCloses: () => domainCloses }
}

describe('官方宿主集成', () => {
  it('通过 HTTP 创建 Space/Chat，重启后保持身份与顺序', async () => {
    const h = await host()
    const first = await h.request({ op: 'create-space', name: '项目' })
    const second = await h.request({ op: 'create-chat', name: '讨论' })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const ids = h.ctx.workspaceRegistry.list().map(row => row.id)
    expect(ids).toHaveLength(2)
    await h.workspaceFiber.restart()
    expect(h.ctx.workspaceRegistry.list().map(row => row.id)).toEqual(ids)
    expect(h.domainCloses()).toBe(1)
    const registry = await fetch(`${h.url}/registry`).then(response => response.json())
    expect(registry.items.map((item: { kind: string }) => item.kind)).toEqual(['chat', 'space'])
  })

  it('写入失败后复用核心身份，不接管缺失目录的普通工作区', async () => {
    const h = await host()
    h.failSettings()
    expect((await h.request({ op: 'create-space', name: 'demo' })).status).toBe(400)
    const id = h.ctx.workspaceRegistry.list()[0]!.id
    expect((await h.request({ op: 'create-space', name: 'demo' })).status).toBe(200)
    expect(h.ctx.workspaceRegistry.list().map(row => row.id)).toEqual([id])
    const missing = join(h.root, 'spaces', 'missing')
    await mkdir(missing)
    const plain = await h.ctx.workspaceRegistry.create(missing)
    await rm(missing, { recursive: true })
    expect((await h.request({ op: 'create-space', name: 'missing' })).body.error).toContain('显式增强')
    expect(h.ctx.workspaceRegistry.get(plain.id)).toBeDefined()
  })

  it('卸载与重载回收全部插件入口，不改变核心数据', async () => {
    const h = await host()
    await h.request({ op: 'create-space', name: 'demo' })
    const ids = h.ctx.workspaceRegistry.list().map(row => row.id)
    expect(h.commands.has('space')).toBe(true)
    expect(h.tools.has('space')).toBe(true)
    expect(h.prompts.has('space:context')).toBe(true)
    await h.fiber.dispose()
    expect([h.routes.size, h.commands.size, h.tools.size, h.prompts.size]).toEqual([0, 0, 0, 0])
    expect(h.ctx.workspaceRegistry.list().map(row => row.id)).toEqual(ids)
    const reloaded = await h.ctx.plugin(plugin)
    cleanups.push(() => reloaded.dispose())
    expect(h.routes.size).toBe(3)
    expect((await fetch(`${h.url}/registry`).then(response => response.json())).items[0].kind).toBe('space')
  })

  it('命令、模型工具与提示词共享核心会话归属，设主不改变归属或顺序', async () => {
    const h = await host()
    const command = h.commands.get('space')!
    expect(await command.handler({ rawInput: 'create demo' } as CommandInvocation)).toMatchObject({ kind: 'success' })
    const workspace = h.ctx.workspaceRegistry.list()[0]!
    const member = join(h.root, 'member')
    await mkdir(member)
    const tool = h.tools.get('space')!
    await tool.execute({ action: 'attach', workspace: workspace.id, target: member })
    h.headers.push({ id: 'session', cwd: workspace.path, createdAt: Date.now() })
    await workspace.attachSession('session' as Parameters<typeof workspace.attachSession>[0])
    const order = [...workspace.sessionIds]
    await tool.execute({ action: 'primary', workspace: workspace.id, target: member })
    expect(workspace.sessionIds).toEqual(order)
    const text = h.prompts.get('space:context')!.text({ agent: { session: { id: 'session' } } })
    expect(text).toContain(workspace.path)
    expect(text).toContain(`${member}（主成员）`)
    expect(h.prompts.get('space:context')!.text({ agent: { session: { id: 'other' } } })).toBe('')
    await tool.execute({ action: 'drop-space', workspace: workspace.id })
    expect(workspace.sessionIds).toEqual(order)
    expect(h.prompts.get('space:context')!.text({ agent: { session: { id: 'session' } } })).toBe('')
  })

  it('独立对话及分叉读取同一官方工作区的简短目录提示', async () => {
    const h = await host()
    await h.request({ op: 'create-chat' })
    const workspace = h.ctx.workspaceRegistry.list()[0]!
    for (const id of ['session', 'fork']) {
      h.headers.push({ id, cwd: workspace.path, createdAt: Date.now() })
      await workspace.attachSession(id as Parameters<typeof workspace.attachSession>[0])
    }
    const prompt = (id: string) => h.prompts.get('space:context')!.text({ agent: { session: { id } } })
    expect(prompt('session')).toBe(prompt('fork'))
    expect(prompt('session')).toContain(workspace.path)
    expect(prompt('session')).toContain('work/ 用于过程文件和工作材料，outputs/ 用于交付产物。')
  })
})
