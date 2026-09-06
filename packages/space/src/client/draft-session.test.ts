import { describe, expect, it, vi } from 'vitest'
import { createDraftSession } from './draft-session.ts'

function harness() {
  const port = {
    allocate: vi.fn(async () => 'chat-workspace'),
    create: vi.fn(async (_workspace: string, id: string) => id),
    adopt: vi.fn(async () => {}),
    clearSelection: vi.fn(),
  }
  return { port, draft: createDraftSession(port) }
}
const payload = { text: 'hello', imageIds: ['image-a'] }
const signal = (): AbortSignal => new AbortController().signal

describe('新会话草稿的实体边界', () => {
  it('新建和切换目标只改变草稿意图', () => {
    const { draft, port } = harness()
    draft.begin('project-a')
    draft.setTarget('project-b')
    draft.begin()
    expect(draft.getSnapshot()).toMatchObject({ active: true, phase: 'editing', targetId: undefined })
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.create).not.toHaveBeenCalled()
  })

  it('首次提交在真实创建后才交付文本和附件', async () => {
    const { draft, port } = harness()
    draft.begin('project')
    await draft.submit(payload, signal())
    const state = draft.getSnapshot()
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.create).toHaveBeenCalledWith('project', state.requestedSessionId)
    expect(port.adopt).toHaveBeenCalledWith(state.sessionId, payload)
    expect(state).toMatchObject({ phase: 'created', active: false })
  })

  it('丢弃释放创建身份但保留当前工作区意图', async () => {
    const { draft, port } = harness()
    port.create.mockRejectedValueOnce(new Error('failed'))
    draft.begin('project')
    await expect(draft.submit(payload, signal())).rejects.toThrow()
    expect(draft.discard()).toBe(true)
    expect(draft.getSnapshot()).toEqual({ active: true, phase: 'editing', targetId: 'project' })
  })

  it('纯附件可以创建会话，空输入不能创建', async () => {
    const { draft, port } = harness()
    draft.begin()
    await expect(draft.submit({ text: ' ', imageIds: [] }, signal())).rejects.toThrow()
    expect(port.allocate).not.toHaveBeenCalled()
    await draft.submit({ text: '', imageIds: ['image'] }, signal())
    expect(port.create).toHaveBeenCalledTimes(1)
  })

  it('目录响应丢失后锁定目标并复用同一个创建标记', async () => {
    const { draft, port } = harness()
    port.allocate.mockRejectedValueOnce(new Error('response lost'))
    draft.begin()
    await expect(draft.submit(payload, signal())).rejects.toThrow('response lost')
    const creationId = draft.getSnapshot().creationId
    draft.setTarget('another-project')
    expect(draft.getSnapshot().targetId).toBeUndefined()
    await draft.submit(payload, signal())
    expect(port.allocate.mock.calls).toEqual([[creationId], [creationId]])
  })

  it('会话响应丢失后复用请求身份，不依赖 blank 会话猜测', async () => {
    const { draft, port } = harness()
    port.create.mockRejectedValueOnce(new Error('response lost'))
    draft.begin('project')
    await expect(draft.submit(payload, signal())).rejects.toThrow()
    const id = draft.getSnapshot().requestedSessionId
    await draft.submit(payload, signal())
    expect(port.create.mock.calls).toEqual([['project', id], ['project', id]])
  })

  it('真实会话未接收输入时保留其身份，重试不再创建', async () => {
    const { draft, port } = harness()
    port.adopt.mockRejectedValueOnce(new Error('not ready'))
    draft.begin('project')
    await expect(draft.submit(payload, signal())).rejects.toThrow()
    expect(draft.getSnapshot().sessionId).toBeTruthy()
    await draft.submit(payload, signal())
    expect(port.create).toHaveBeenCalledTimes(1)
    expect(port.adopt).toHaveBeenCalledTimes(2)
  })

  it('创建期间重复提交和丢弃不能发起第二个请求', async () => {
    const { draft, port } = harness()
    let finish!: (value: string) => void
    port.create.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    draft.begin('project')
    const first = draft.submit(payload, signal())
    await expect(draft.submit(payload, signal())).rejects.toThrow()
    expect(draft.discard()).toBe(false)
    finish('real-session')
    await first
    expect(port.create).toHaveBeenCalledTimes(1)
  })

  it.each(['suspend', 'dispose'] as const)('创建期间 %s 不会被迟到结果导航或发送', async (action) => {
    const { draft, port } = harness()
    let finish!: (value: string) => void
    port.create.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    draft.begin('project')
    const first = draft.submit(payload, signal())
    draft[action]()
    finish('real-session')
    await expect(first).rejects.toThrow('已离开')
    expect(port.adopt).not.toHaveBeenCalled()
    expect(draft.getSnapshot().sessionId).toBe('real-session')
  })

  it('取消后的目录响应被保留，但不继续创建 Session', async () => {
    const { draft, port } = harness()
    let finish!: (value: string) => void
    port.allocate.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const controller = new AbortController()
    draft.begin()
    const first = draft.submit(payload, controller.signal)
    controller.abort()
    finish('chat-workspace')
    await expect(first).rejects.toThrow('已离开')
    expect(draft.getSnapshot().workspaceId).toBe('chat-workspace')
    expect(port.create).not.toHaveBeenCalled()
  })
})
