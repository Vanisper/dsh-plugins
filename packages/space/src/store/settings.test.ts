import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { describe, expect, it } from 'vitest'
import { registerSpaceStore } from './settings.ts'

class MemorySettingsProvider extends SettingsProvider {
  readonly writable = true
  persisted: Record<string, unknown> = {}

  constructor(ctx: Context, document: Record<string, unknown>) {
    super(ctx)
    this.publish(document)
  }

  protected async load(): Promise<Record<string, unknown>> {
    return this.persisted
  }

  protected async persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.persisted[ns] = structuredClone(section)
  }
}

function provider(document: Record<string, unknown>): MemorySettingsProvider {
  return new MemorySettingsProvider(new Context(), document)
}

describe('registerSpaceStore', () => {
  it('preserves the empty root through the real settings provider', () => {
    const store = registerSpaceStore(provider({
      'dsh-space': { root: '', spaces: [], chats: [] },
    }))

    expect(store.read()).toEqual({ root: '', spaces: [], chats: [] })
  })

  it('rejects unknown fields instead of letting the schema discard them', () => {
    expect(() => registerSpaceStore(provider({
      'dsh-space': { root: '', spaces: [], chats: [], legacy: true },
    }))).toThrow('未知字段')
  })

  it('rejects the former registry shape during registration', () => {
    expect(() => registerSpaceStore(provider({
      'dsh-space': {
        spaces: [{ id: 'old-space', name: 'Old Space', folders: [] }],
      },
    }))).toThrow('workspaceId')
  })
})
