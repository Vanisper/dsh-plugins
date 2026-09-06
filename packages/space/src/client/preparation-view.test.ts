// @vitest-environment jsdom
import type { ReactLike, RegistryPayload, WorkspaceService } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreparationView } from './preparation-view.ts'
import { createPreparation } from './preparation.ts'

const fixture = vi.hoisted(() => ({
  registry: undefined as RegistryPayload | undefined,
  receive: undefined as ((value: RegistryPayload | undefined, error?: string) => void) | undefined,
}))
vi.mock('./registry.ts', () => ({
  observeRegistry: (receive: (value: RegistryPayload | undefined, error?: string) => void) => {
    fixture.receive = receive
    receive(fixture.registry)
    return () => {
      fixture.receive = undefined
    }
  },
}))
let cleanup: (() => Promise<void>) | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.open = true },
    close(this: HTMLDialogElement) { this.open = false },
  })
})
afterEach(async () => {
  await cleanup?.()
  document.body.innerHTML = ''
})

async function mount(options: { loading?: boolean, targetId?: string } = {}) {
  fixture.registry = {
    ok: true,
    root: '/managed',
    invalidSpaces: [],
    invalidChats: [],
    items: [
      { kind: 'space', workspaceId: 's', title: '项目空间', path: '/project', sessionIds: [], members: [{ path: '/member', mode: 'reference', title: '前端' }], primary: '/member' },
      { kind: 'plain', workspaceId: 'p', title: '普通目录', path: '/plain', sessionIds: [] },
      { kind: 'chat', workspaceId: 'c', title: 'new-chat-7', path: '/chats/7', sessionIds: [] },
    ],
  }
  const core = { phase: 'ready', items: fixture.registry.items }
  const registry = fixture.registry
  if (options.loading)
    fixture.registry = undefined
  const workspaces = { list: { getSnapshot: () => core, subscribe: () => () => {} } } as unknown as WorkspaceService
  const port = { allocate: vi.fn(async () => 'c'), connect: vi.fn(async () => 'session'), open: vi.fn(), transfer: vi.fn() }
  const preparation = createPreparation(port)
  preparation.begin(options.targetId)
  const View = createPreparationView(React as unknown as ReactLike, preparation, workspaces)
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => root.render(createElement(View as React.ComponentType)))
  cleanup = async () => {
    await act(async () => root.unmount())
    preparation.dispose()
  }
  return { preparation, port, registry }
}

async function click(name: string) {
  const button = Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === name || button.textContent === name)
  if (!button)
    throw new Error(`找不到 ${name}`)
  await act(async () => button.click())
}
async function draft(text: string) {
  const input = document.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('新对话准备视图', () => {
  it('描述读取期间不误报工作区类型或移除状态，失败恢复后保留目标与文本', async () => {
    const { port, registry } = await mount({ loading: true, targetId: 's' })
    await draft('等待期间编辑')
    expect(document.querySelector('h1')?.textContent).toBe('新对话')
    expect(document.body.textContent).not.toContain('工作区已移除')
    expect(document.body.textContent).not.toContain('独立对话')
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="发送"]')?.disabled).toBe(true)
    await act(async () => fixture.receive?.(undefined, '网络断开'))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('读取失败')
    await act(async () => fixture.receive?.(registry))
    expect(document.querySelector('h1')?.textContent).toBe('空间新对话')
    expect(document.querySelector('.dsh-space-preparation-context')?.textContent).toContain('前端')
    expect(document.querySelector('textarea')?.value).toBe('等待期间编辑')
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="发送"]')?.disabled).toBe(false)
    expect(port.connect).not.toHaveBeenCalled()
  })

  it('目标列表包含普通目录与空间，排除独立对话目录，切换与清除保留文本', async () => {
    const { preparation, port } = await mount()
    await draft('待发送内容')
    await click('选择对话工作区')
    expect(document.querySelector('dialog')?.textContent).toContain('普通目录')
    expect(document.querySelector('dialog')?.textContent).not.toContain('new-chat-7')
    await click('项目空间/project')
    expect(document.querySelector('.dsh-space-preparation-context')?.textContent).toContain('前端')
    expect(document.querySelector('textarea')?.value).toBe('待发送内容')
    await click('清除工作区选择')
    expect(preparation.getSnapshot()).toMatchObject({ targetId: undefined, draft: '待发送内容' })
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.connect).not.toHaveBeenCalled()
  })

  it('管理入口打开已有 Chat 时显示独立对话，进入完整输入区复用该目录', async () => {
    const { port } = await mount({ targetId: 'c' })
    expect(document.querySelector('.dsh-space-target-button')?.textContent).toBe('独立对话')
    expect(document.querySelector('.dsh-space-preparation-context')?.textContent).toContain('/chats/7')
    await click('完整输入区')
    expect(document.querySelector('dialog')?.textContent).not.toContain('将创建独立对话目录')
    await click('进入输入区')
    expect(port.allocate).not.toHaveBeenCalled()
    expect(port.connect).toHaveBeenCalledWith('c')
  })

  it('完整输入区先解释实体创建，取消不分配，确认只连接不发送', async () => {
    const { preparation, port } = await mount()
    await draft('内容')
    await click('完整输入区')
    expect(document.querySelector('dialog')?.textContent).toContain('将创建独立对话目录')
    await click('取消')
    expect(port.allocate).not.toHaveBeenCalled()
    await click('完整输入区')
    await click('进入输入区')
    expect(port.allocate).toHaveBeenCalledTimes(1)
    expect(preparation.getSnapshot()).toMatchObject({ submit: false, draft: '内容' })
  })

  it('中文输入法确认和 Shift+Enter 不误发送，普通 Enter 才交接', async () => {
    const { port } = await mount()
    await draft('中文输入')
    const input = document.querySelector('textarea')!
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    })
    expect(port.allocate).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(port.allocate).toHaveBeenCalledTimes(1)
  })

  it('丢弃需要确认，关闭准备页只隐藏而保留文本', async () => {
    const { preparation } = await mount()
    await draft('内容')
    await click('丢弃准备草稿')
    await click('取消')
    expect(preparation.getSnapshot().draft).toBe('内容')
    await click('返回原输入区并保留草稿')
    expect(preparation.getSnapshot()).toMatchObject({ active: false, draft: '内容' })
  })
})
