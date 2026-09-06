import type { DraftHostConversation, DraftHostSessions } from './draft-host.ts'
import type { ReactLike, SessionSnapshot, SlotsService, WorkspaceService } from './types.ts'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDraftComposer } from './draft-host.ts'
import { createNativeComposer } from './native-compat.ts'

function store<T>(state: T) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    set: (next: T) => {
      state = next
    },
  }
}

function harness() {
  const snapshot: SessionSnapshot = { ids: [], byId: {}, phase: 'ready' }
  const require = (name: string): unknown => name === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : {}
  const { Shell } = createNativeComposer(require)
  const send = vi.fn(async () => {
    throw new Error('credentials missing')
  })
  const target = new Shell({ actx: {}, defaultSink: send, commandImages: {} })
  const sessions = {
    list: store(snapshot),
    clear: vi.fn(() => { snapshot.current = undefined }),
    refresh: vi.fn(async () => {}),
    create: vi.fn(async ({ sessionId }: { sessionId: string }) => {
      snapshot.ids.push(sessionId)
      snapshot.byId[sessionId] = { id: sessionId, blank: true, running: false, updatedAt: 1, displayTitle: 'New' }
      return sessionId
    }),
    scope: () => ({}),
    binding: () => ({ session: { getSnapshot: () => ({ openState: 'open' }) } }),
    open: vi.fn((id: string) => { snapshot.current = id }),
  }
  const block = store<{ reason: string } | undefined>(undefined)
  const workspaces = { refresh: vi.fn(async () => {}), list: store({ items: [{ workspaceId: 'project', sessionIds: snapshot.ids }] }) }
  const conversation = { input: { for: () => target }, blocks: { storeFor: () => block } }
  const composer = createDraftComposer(React as unknown as ReactLike, require, {}, {} as SlotsService, sessions as unknown as DraftHostSessions, workspaces as unknown as WorkspaceService, conversation as unknown as DraftHostConversation)
  return { composer, sessions, target, send, block }
}

describe('原生草稿接入宿主', () => {
  it('新建时不创建；首次提交通过宿主创建真实身份并交付全部输入', async () => {
    const h = harness()
    h.composer.draft.begin('project')
    expect(h.sessions.create).not.toHaveBeenCalled()
    h.composer.input.setDraft('keep on failure')
    h.composer.input.addImages(['image'])
    h.composer.input.submit()
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(h.composer.input.snapshot.draft).toBe(''))
    expect(h.sessions.create).toHaveBeenCalledTimes(1)
    expect(h.sessions.list.getSnapshot().ids).toHaveLength(1)
    expect(h.target.snapshot).toMatchObject({ draft: 'keep on failure', imageIds: ['image'] })
    h.composer.input.dispose()
    h.target.dispose()
  })

  it('真实输入已有内容时不覆盖，保留草稿和真实身份供恢复', async () => {
    const h = harness()
    h.target.setDraft('existing')
    h.composer.draft.begin('project')
    h.composer.input.setDraft('new draft')
    h.composer.input.submit()
    await vi.waitFor(() => expect(h.composer.draft.getSnapshot().error).toContain('已有输入'))
    expect(h.sessions.list.getSnapshot().ids).toHaveLength(1)
    expect(h.composer.input.snapshot.draft).toBe('new draft')
    expect(h.target.snapshot.draft).toBe('existing')
    expect(h.sessions.open).not.toHaveBeenCalled()
    h.composer.input.dispose()
    h.target.dispose()
  })

  it('宿主阻止发送时把恢复责任留在真实输入区，不退回第二个页面', async () => {
    const h = harness()
    h.block.set({ reason: 'choose model' })
    h.composer.draft.begin('project')
    h.composer.input.setDraft('pending')
    h.composer.input.submit()
    await vi.waitFor(() => expect(h.composer.draft.getSnapshot().phase).toBe('created'))
    expect(h.target.snapshot.draft).toBe('pending')
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sessions.open).toHaveBeenCalledTimes(1)
    h.composer.input.dispose()
    h.target.dispose()
  })

  it('核心已创建但响应丢失时，重试只查找请求身份，不复用其他空白会话', async () => {
    const h = harness()
    const create = h.sessions.create.getMockImplementation()!
    h.sessions.create.mockImplementationOnce(async (input) => {
      await create(input)
      throw new Error('response lost')
    })
    h.composer.draft.begin('project')
    h.composer.input.setDraft('retry')
    h.composer.input.submit()
    await vi.waitFor(() => expect(h.composer.input.snapshot.phase).toBe('plain'))
    expect(h.composer.draft.getSnapshot().error).toBe('response lost')
    h.composer.input.submit()
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(1))
    expect(h.sessions.create).toHaveBeenCalledTimes(1)
    expect(h.sessions.list.getSnapshot().ids).toHaveLength(1)
    await vi.waitFor(() => expect(h.composer.input.snapshot.draft).toBe(''))
    h.composer.draft.begin('project')
    expect(h.composer.input.notices.getSnapshot()).toBeNull()
    h.composer.input.dispose()
    h.target.dispose()
  })
})
