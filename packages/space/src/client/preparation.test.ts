import { describe, expect, it, vi } from 'vitest'
import { createPreparation } from './preparation.ts'

function setup() {
  const port = {
    allocate: vi.fn(async () => 'chat'),
    connect: vi.fn(async () => 'session'),
    open: vi.fn(),
    transfer: vi.fn(),
  }
  return { port, preparation: createPreparation(port) }
}

describe('会话准备与官方输入交接', () => {
  it('创建响应丢失后使用相同请求标识重试，丢弃后新请求使用新标识', async () => {
    const { port, preparation: p } = setup()
    port.allocate.mockRejectedValueOnce(new Error('响应断线'))
    p.begin()
    await p.connect(false)
    const request = p.getSnapshot().creationId
    await p.connect(false)
    expect(port.allocate.mock.calls).toEqual([[request], [request]])
    p.deliver('session')
    p.begin()
    await p.connect(false)
    expect(p.getSnapshot().creationId).not.toBe(request)
  })

  it('进入、改选、清空目标和离开均不分配实体，保留同一份草稿', () => {
    const { port, preparation: p } = setup()
    p.begin('workspace')
    p.setDraft('未发送内容')
    p.setTarget('another')
    p.setTarget()
    p.suspend()
    p.resume()
    expect(p.getSnapshot()).toMatchObject({ active: true, targetId: undefined, draft: '未发送内容' })
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.connect).not.toHaveBeenCalled()
  })

  it('首次发送才分配独立目录，输入区挂载后仅交接一次', async () => {
    const { port, preparation: p } = setup()
    p.begin()
    await p.connect(true)
    expect(port.allocate).not.toHaveBeenCalled()
    p.setDraft('内容')
    await p.connect(true)
    expect(port.allocate).toHaveBeenCalledTimes(1)
    expect(port.connect).toHaveBeenCalledWith('chat')
    expect(port.open).toHaveBeenCalledWith('session')
    expect(port.transfer).not.toHaveBeenCalled()
    p.deliver('other')
    expect(port.transfer).not.toHaveBeenCalled()
    p.deliver('session')
    p.deliver('session')
    expect(port.transfer).toHaveBeenCalledExactlyOnceWith('session', '内容', true)
    expect(p.getSnapshot()).toMatchObject({ active: false, draft: '', phase: 'editing' })
  })

  it('已有工作区不创建目录，完整输入交接不自动发送', async () => {
    const { port, preparation: p } = setup()
    p.begin('workspace')
    await p.connect(false)
    p.deliver('session')
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.connect).toHaveBeenCalledWith('workspace')
    expect(port.transfer).toHaveBeenCalledWith('session', '', false)
  })

  it('连接失败锁定已分配身份，重试不重复创建且保留草稿', async () => {
    const { port, preparation: p } = setup()
    port.connect.mockRejectedValueOnce(new Error('断线'))
    p.begin()
    p.setDraft('内容')
    await p.connect(true)
    p.setTarget('another')
    p.begin('another')
    expect(p.getSnapshot()).toMatchObject({ workspaceId: 'chat', targetId: undefined, draft: '内容' })
    expect(p.getSnapshot().error).toContain('不能直接改选')
    await p.connect(true)
    expect(port.allocate).toHaveBeenCalledTimes(1)
    expect(port.connect).toHaveBeenCalledTimes(2)
    expect(port.connect).toHaveBeenLastCalledWith('chat')
  })

  it('交接失败保留目标、会话和草稿，重试不重复连接', async () => {
    const { port, preparation: p } = setup()
    port.transfer.mockImplementationOnce(() => {
      throw new Error('已有草稿')
    })
    p.begin('workspace')
    p.setDraft('内容')
    await p.connect(true)
    p.deliver('session')
    expect(p.getSnapshot()).toMatchObject({ phase: 'editing', sessionId: 'session', draft: '内容', error: '已有草稿' })
    await p.connect(true)
    p.deliver('session')
    expect(port.connect).toHaveBeenCalledTimes(1)
  })

  it('进行中禁止重复发送、编辑或丢弃，导航离开后不抢回当前会话', async () => {
    const { port, preparation: p } = setup()
    let resolve!: (id: string) => void
    port.allocate.mockReturnValueOnce(new Promise<string>((done) => {
      resolve = done
    }))
    p.begin()
    p.setDraft('原内容')
    const pending = p.connect(true)
    await p.connect(true)
    p.discard()
    p.suspend()
    p.begin('another')
    p.setDraft('新内容')
    expect(p.getSnapshot()).toMatchObject({ active: false, draft: '原内容', phase: 'connecting' })
    resolve('chat')
    await pending
    expect(port.allocate).toHaveBeenCalledTimes(1)
    expect(port.open).not.toHaveBeenCalled()
    expect(p.getSnapshot()).toMatchObject({ active: false, draft: '原内容', sessionId: 'session', phase: 'editing' })
  })

  it('卸载后迟到的分配结果不连接或导航', async () => {
    const { port, preparation: p } = setup()
    let resolve!: (id: string) => void
    port.allocate.mockReturnValueOnce(new Promise<string>((done) => {
      resolve = done
    }))
    p.begin()
    const pending = p.connect(false)
    p.dispose()
    resolve('chat')
    await pending
    expect(port.connect).not.toHaveBeenCalled()
    expect(port.open).not.toHaveBeenCalled()
  })
})
