// @vitest-environment jsdom
import type { ReactLike, RegistryPayload, WorkspaceService } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostWorkspacePicker } from './target-picker.ts'

const fixture = vi.hoisted(() => ({ receive: undefined as ((value?: RegistryPayload, error?: string) => void) | undefined }))
vi.mock('./registry.ts', () => ({
  observeRegistry: (receive: (value?: RegistryPayload, error?: string) => void) => {
    fixture.receive = receive
    return () => {
      fixture.receive = undefined
    }
  },
}))
let cleanup: () => Promise<void>
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

async function mount(disabled = false) {
  const registry: RegistryPayload = {
    ok: true,
    root: '/managed',
    invalidSpaces: [],
    invalidChats: [],
    items: [
      { kind: 'space', workspaceId: 's', path: '/project', title: '项目空间', sessionIds: [] },
      { kind: 'plain', workspaceId: 'p', path: '/plain', title: '普通目录', sessionIds: [] },
      { kind: 'chat', workspaceId: 'c', path: '/chat', title: 'new-chat', sessionIds: [] },
    ],
  }
  const core = { phase: 'ready', items: registry.items }
  const workspace = { list: { getSnapshot: () => core, subscribe: () => () => {} } } as unknown as WorkspaceService
  const Picker = createHostWorkspacePicker(React as unknown as ReactLike, workspace)
  const onPick = vi.fn()
  const onIndependent = vi.fn()
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => root.render(createElement(Picker as React.ComponentType<any>, {
    open: true,
    independent: true,
    selectedId: 's',
    disabled,
    onPick,
    onIndependent,
    onClose: vi.fn(),
  })))
  cleanup = async () => {
    await act(async () => root.unmount())
  }
  return { registry, onPick, onIndependent }
}

describe('原生输入目标选择', () => {
  it('只列普通目录和空间；独立对话是草稿意图，不是伪工作区', async () => {
    const h = await mount()
    await act(async () => fixture.receive?.(h.registry))
    expect(document.querySelector('dialog')?.textContent).toContain('普通目录')
    expect(document.querySelector('dialog')?.textContent).not.toContain('new-chat')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.dsh-space-target-list button')]
    await act(async () => buttons[2]!.click())
    expect(h.onPick).toHaveBeenCalledWith('p')
    await act(async () => buttons[0]!.click())
    expect(h.onIndependent).toHaveBeenCalledTimes(1)
    expect(h.onPick).toHaveBeenCalledTimes(1)
  })

  it('创建后目标锁定，点击候选不会改投另一个工作区', async () => {
    const h = await mount(true)
    await act(async () => fixture.receive?.(h.registry))
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.dsh-space-target-list button')]
    expect(buttons.every(button => button.disabled)).toBe(true)
    await act(async () => buttons.forEach(button => button.click()))
    expect(h.onPick).not.toHaveBeenCalled()
    expect(h.onIndependent).not.toHaveBeenCalled()
  })

  it('描述加载或失败不会把 Chat 目录误列为项目，恢复后保留当前选择', async () => {
    const h = await mount()
    expect(document.body.textContent).toContain('正在读取工作区')
    await act(async () => fixture.receive?.(undefined, 'offline'))
    expect(document.querySelector('[role=alert]')?.textContent).toContain('读取失败')
    await act(async () => fixture.receive?.(h.registry))
    expect(document.querySelector('[aria-pressed=true]')?.textContent).toContain('项目空间')
    expect(h.onPick).not.toHaveBeenCalled()
  })
})
