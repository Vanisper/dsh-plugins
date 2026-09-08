// @vitest-environment jsdom
import type { MemberDraft } from './member-editor.ts'
import type { ReactLike } from './types.ts'
import { act, createElement } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemberEditor } from './member-editor.ts'

let cleanup: (() => Promise<void>) | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, { matchMedia: () => ({ matches: true }) })
})
afterEach(async () => {
  await cleanup?.()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mount(initial: MemberDraft = { members: [] }) {
  let current = initial
  const changes = vi.fn()
  const pick = vi.fn<(accept: (path: string) => void) => void>()
  const Editor = createMemberEditor(React as unknown as ReactLike) as React.ComponentType<{
    draft: MemberDraft
    setDraft: (draft: MemberDraft) => void
    onPick: (accept: (path: string) => void) => void
  }>
  function App() {
    const [draft, setDraft] = React.useState(initial)
    return createElement(Editor, {
      draft,
      setDraft: (next) => {
        current = next
        changes(next)
        setDraft(next)
      },
      onPick: pick,
    })
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(App)))
  cleanup = async () => act(() => root.unmount())
  return {
    draft: () => current,
    pick,
    changes,
    select: async (path: string) => {
      await click('添加成员目录')
      await act(async () => pick.mock.calls.at(-1)![0](path))
    },
  }
}

function button(label: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === label)!
}
async function click(label: string): Promise<void> {
  await act(async () => button(label).click())
}
describe('成员目录添加与精简编辑', () => {
  it('只提供系统目录选择，不显示手动路径输入或备用入口', async () => {
    const h = await mount()
    expect(document.querySelector('details')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(document.querySelectorAll('button')).toHaveLength(1)
    expect(button('添加成员目录')).toBeDefined()
    await click('添加成员目录')
    expect(h.pick).toHaveBeenCalledOnce()
    expect(h.changes).not.toHaveBeenCalled()
  })

  it('目录选择只追加引用成员，保留添加按钮身份', async () => {
    const h = await mount()
    const picker = button('添加成员目录')
    await h.select('/picked/source')
    expect(button('添加成员目录')).toBe(picker)
    await h.select(' /another/existing ')
    expect(h.draft()).toEqual({ members: [{ path: '/picked/source', mode: 'reference' }, { path: '/another/existing', mode: 'reference' }], primary: '/picked/source' })
    expect(h.pick).toHaveBeenCalledTimes(2)
  })

  it('只有一个成员时隐藏主要标记及单选，多成员仍能切换主成员', async () => {
    const h = await mount({ members: [{ path: '/a', mode: 'reference' }], primary: '/a' })
    expect(document.querySelector('.dsh-space-badge')).toBeNull()
    expect(document.querySelector('input[type="radio"]')).toBeNull()
    await h.select('/b')
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(2)
    expect(document.querySelector('.dsh-space-badge')?.textContent).toBe('主要')
    await act(async () => document.querySelector<HTMLInputElement>('[aria-label="将 b 设为主要"]')!.click())
    expect(h.draft().primary).toBe('/b')
    await click('移除成员 a')
    expect(document.querySelector('.dsh-space-badge')).toBeNull()
    expect(document.querySelector('input[type="radio"]')).toBeNull()
  })

  it('隐藏名称说明编辑但保留值，链接切换保留自定义名称', async () => {
    const member = { path: '/a', mode: 'link' as const, title: '旧名称', description: '保留说明', linkName: 'custom-link' }
    const h = await mount({ members: [member], primary: '/a' })
    expect(document.querySelector('textarea')).toBeNull()
    const checkbox = document.querySelector<HTMLInputElement>('[aria-label="为 旧名称 创建链接"]')!
    await act(async () => checkbox.click())
    expect(h.draft().members[0]).toEqual({ ...member, mode: 'reference', linkName: undefined })
    await act(async () => checkbox.click())
    expect(h.draft().members[0]).toEqual(member)
  })

  it('重复选择不修改成员，重新选择其他目录后清理错误', async () => {
    const h = await mount({ members: [{ path: '/existing', mode: 'reference' }], primary: '/existing' })
    await h.select('/existing/')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('此目录已在成员列表中')
    expect(h.changes).not.toHaveBeenCalled()
    await h.select('/other')
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(h.draft().members).toHaveLength(2)
  })

  it('达到成员上限后选择目录不追加成员', async () => {
    const h = await mount({ members: Array.from({ length: 100 }, (_, i) => ({ path: `/member-${i}`, mode: 'reference' })) })
    await h.select('/another')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('一个空间最多添加 100 个成员')
    expect(h.changes).not.toHaveBeenCalled()
    expect(h.draft().members).toHaveLength(100)
  })
})
