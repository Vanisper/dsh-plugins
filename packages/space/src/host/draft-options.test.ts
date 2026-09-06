import type { Context } from '@deepseek-ai/cordis'
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
    }
    const get = vi.fn((name: string) => services[name])
    const result = await readDraftOptions({ get } as unknown as Pick<Context, 'get'>)
    expect(result.current).toEqual({ provider: 'provider', model: 'model' })
    expect(result.groups[0]?.models[0]).toMatchObject({ id: 'model', reasoning: { defaultEffort: 'high' } })
    expect(result.permissions?.currentValue).toBe('workspace-write')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(get.mock.calls.flat()).toEqual(['llm', 'agentDefaultModel', 'permissionPresets'])
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
