import type { Context } from '@deepseek-ai/cordis'
import { Context as HostContext } from '@deepseek-ai/cordis'
import { CommandRuntime } from '@deepseek-ai/dsh-commands'
import { describe, expect, it, vi } from 'vitest'
import { readDraftOptions } from './draft-options.ts'

describe('无实体的新会话选项', () => {
  it('只读宿主候选和默认值，不申请工作区或会话', async () => {
    const services: Record<string, unknown> = {
      llm: {
        listProviders: () => [{ id: 'provider', name: 'Provider' }],
        listModels: async () => [{ id: 'model', name: 'Model', apiKey: 'must-not-leak' }],
        resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } }),
      },
      agentDefaultModel: { currentSelection: () => ({ provider: 'provider', model: 'model' }) },
      permissionPresets: {
        names: ['workspace-write'],
        defaultPreset: 'workspace-write',
        optionOf: (value: string) => ({ value, name: 'Workspace Write' }),
      },
      commands: { list: vi.fn(() => [{ name: 'goal', description: 'Goal', input: { hint: 'objective', images: true, private: 'must-not-leak' }, handler: 'must-not-leak' }]) },
    }
    const get = vi.fn((name: string) => services[name])
    const result = await readDraftOptions({ get } as unknown as Pick<Context, 'get'>)
    expect(result.current).toEqual({ provider: 'provider', model: 'model' })
    expect(result.groups[0]?.models[0]).toMatchObject({ id: 'model', reasoning: { defaultEffort: 'high' } })
    expect(result.permissions?.currentValue).toBe('workspace-write')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(result.commands).toEqual([{ name: 'goal', description: 'Goal', input: { hint: 'objective', images: true } }])
    expect(get.mock.calls.flat()).toEqual(['llm', 'agentDefaultModel', 'permissionPresets', 'agentPresets', 'commands'])
  })

  it('官方命令运行时的全局目录无须 Agent，注册和卸载立即反映在下一次查询', async () => {
    const ctx = new HostContext()
    const fiber = await ctx.plugin(CommandRuntime)
    const handler = vi.fn(() => ({ kind: 'success' as const }))
    const off = ctx.commands.register({ name: 'goal', description: 'Goal', handler })
    expect((await readDraftOptions(ctx)).commands).toEqual([{ name: 'goal', description: 'Goal' }])
    off()
    expect((await readDraftOptions(ctx)).commands).toEqual([])
    expect(handler).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('命令目录不兼容时给出错误，不伪造可执行命令', async () => {
    const result = await readDraftOptions({ get: (name: string) => name === 'commands'
      ? { list: () => {
          throw new Error('unsupported')
        } }
      : undefined } as unknown as Pick<Context, 'get'>)
    const missing = await readDraftOptions({ get: () => undefined } as Pick<Context, 'get'>)
    expect(result.commandError).toContain('命令目录')
    expect(missing.commands).toBeUndefined()
    expect(missing.commandError).toContain('命令目录')
  })

  it('有预设时用官方冷读 key 查询目录，不伪造 Agent 或借用已有 Session', async () => {
    const key = { agentPreset: 'code' }
    const standingKeyFor = vi.fn(async () => key)
    const list = vi.fn(() => [{ name: 'plan', description: 'Enter or leave plan mode' }])
    const services: Record<string, unknown> = { agentPresets: { standingKeyFor }, commands: { list } }
    const result = await readDraftOptions({ get: (name: string) => services[name] } as Pick<Context, 'get'>)
    expect(standingKeyFor).toHaveBeenCalledWith()
    expect(list).toHaveBeenCalledWith(key)
    expect(result.commands?.[0]?.name).toBe('plan')
  })

  it('一个模型源失败不会丢失其他源，不存在的可选服务不伪造配置', async () => {
    const get = (name: string): unknown => name === 'llm'
      ? {
          listProviders: () => [{ id: 'bad', name: 'Bad' }, { id: 'good', name: 'Good' }],
          listModels: async (provider: string) => {
            if (provider === 'bad')
              throw new Error('offline')
            return [{ id: 'model', name: 'Model' }]
          },
          resolveModelInfo: async () => ({}),
        }
      : undefined
    const result = await readDraftOptions({ get } as Pick<Context, 'get'>)
    expect(result.current).toBeNull()
    expect(result.permissions).toBeUndefined()
    expect(result.groups.map(group => group.id)).toEqual(['good'])
    expect(result.failures).toEqual([{ id: 'bad', name: 'Bad', error: 'offline' }])
  })
})
