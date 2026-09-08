// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createSidebarDrag, dropAfter, orderedDrop } from './sidebar-drag.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.body.removeAttribute('data-dsh-space-dragging')
})

function harness() {
  const list = document.createElement('div')
  const source = document.createElement('button')
  list.append(source)
  document.body.append(list)
  const drag = createSidebarDrag(() => list)
  const event = (target: HTMLElement = source, y = 100) => ({ currentTarget: target, clientY: y, clientX: 30, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as DragEvent
  return { drag, list, source, event }
}

it('以完整目标块决定前后落点，源位置不显示虚假插入线', () => {
  const h = harness()
  h.list.getBoundingClientRect = () => ({ top: 20, height: 200 }) as DOMRect
  expect(dropAfter(h.event(h.list, 90))).toBe(false)
  expect(dropAfter(h.event(h.list, 180))).toBe(true)
  h.drag.start({ kind: 'workspace', id: 'w' }, h.event())
  h.drag.over({ kind: 'workspace', id: 'w2', after: true }, h.event(h.list))
  expect(h.drag.getSnapshot().target?.after).toBe(true)
  h.drag.over({ kind: 'workspace', id: 'w', after: true }, h.event(h.list))
  expect(h.drag.getSnapshot().target).toBeUndefined()
  h.drag.reset()
  expect(h.source.hasAttribute('data-drag-source')).toBe(false)
})

it('折叠预览延迟展开，离开取消计时，结束恢复所有预览', async () => {
  vi.useFakeTimers()
  const h = harness()
  h.drag.start({ kind: 'session', id: 's' }, h.event())
  h.drag.over({ kind: 'assign', id: 'g', after: false }, h.event(h.list), 'group:g')
  await vi.advanceTimersByTimeAsync(500)
  expect(h.drag.getSnapshot().previews).toEqual([])
  h.drag.leave({ ...h.event(h.list), relatedTarget: null } as DragEvent)
  await vi.advanceTimersByTimeAsync(500)
  expect(h.drag.getSnapshot().previews).toEqual([])
  h.drag.over({ kind: 'assign', id: 'g', after: false }, h.event(h.list), 'group:g')
  await vi.advanceTimersByTimeAsync(650)
  expect(h.drag.getSnapshot().previews).toEqual(['group:g'])
  h.drag.reset()
  expect(h.drag.getSnapshot()).toEqual({ previews: [] })
})

it.each(['workspace', 'session', 'section', 'group', 'pin'] as const)('%s 原位和相邻无变化落点不显示引导线', (kind) => {
  const h = harness()
  h.list.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect
  const top = h.event(h.list, 101)
  const bottom = h.event(h.list, 139)
  expect(orderedDrop(kind, 'b', 'a', ['a', 'b', 'c'], top)).toBeUndefined()
  expect(orderedDrop(kind, 'a', 'b', ['a', 'b', 'c'], bottom)).toBeUndefined()
  expect(orderedDrop(kind, 'b', 'b', ['a', 'b', 'c'], bottom)).toBeUndefined()
  expect(orderedDrop(kind, 'b', 'a', ['a', 'b', 'c'], bottom)).toEqual({ kind, id: 'b', after: true })
  expect(orderedDrop(kind, 'b', 'foreign', ['a', 'b', 'c'], top)).toEqual({ kind, id: 'b', after: false })
})

it('拖动预览只带图标和标题，跟随指针且在取消时移除', () => {
  const h = harness()
  const title = document.createElement('span')
  title.className = 'dsh-space-session-title'
  title.textContent = '已有会话'
  h.source.append(title, '+3')
  const dispose = h.drag.install()
  const setDragImage = vi.fn()
  h.drag.start({ kind: 'session', id: 's' }, { ...h.event(), dataTransfer: { setData: vi.fn(), setDragImage } } as unknown as DragEvent)
  const preview = document.querySelector<HTMLElement>('.dsh-space-drag-preview')!
  expect(preview.textContent).toBe('已有会话')
  expect(preview.querySelector('svg')).not.toBeNull()
  expect(preview.getAttribute('aria-hidden')).toBe('true')
  expect(setDragImage).toHaveBeenCalledOnce()
  document.dispatchEvent(new MouseEvent('dragover', { clientX: 80, clientY: 160 }))
  expect(preview.style.left).toBe('92px')
  expect(preview.style.top).toBe('172px')
  h.drag.over({ kind: 'session', id: 'b', after: false }, h.event())
  h.drag.over(undefined, h.event())
  expect(h.drag.getSnapshot().target).toBeUndefined()
  dispose()
  expect(document.querySelector('.dsh-space-drag-preview')).toBeNull()
})

it.each(['escape', 'blur', 'outside', 'removed', 'dispose'] as const)('%s 清理源、落点和拖动期监听', (action) => {
  const h = harness()
  const dispose = h.drag.install()
  h.drag.start({ kind: 'group', id: 'g' }, h.event())
  h.drag.over({ kind: 'group', id: 'h', after: false }, h.event(h.list))
  if (action === 'escape') {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  }
  else if (action === 'blur') {
    window.dispatchEvent(new Event('blur'))
  }
  else if (action === 'outside') {
    document.documentElement.dispatchEvent(new MouseEvent('dragleave', { bubbles: true }))
  }
  else if (action === 'removed') {
    h.source.remove()
    h.drag.validate()
  }
  else {
    dispose()
  }
  expect(h.drag.getSnapshot()).toEqual({ previews: [] })
  expect(document.body.hasAttribute('data-dsh-space-dragging')).toBe(false)
  dispose()
})

it('边缘只滚动侧栏，离开侧栏或取消后停止，不改变页面滚动', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16))
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
  const h = harness()
  h.list.getBoundingClientRect = () => ({ top: 20, bottom: 420, left: 0, right: 280, height: 400 }) as DOMRect
  Object.defineProperties(h.list, { scrollHeight: { value: 1000 }, clientHeight: { value: 400 } })
  h.drag.start({ kind: 'session', id: 's' }, h.event())
  h.drag.pointer(h.event(h.list, 415))
  await vi.advanceTimersByTimeAsync(160)
  expect(h.list.scrollTop).toBeGreaterThan(0)
  expect(document.documentElement.scrollTop).toBe(0)
  h.drag.pointer({ ...h.event(h.list, 415), clientX: 300 } as DragEvent)
  const stopped = h.list.scrollTop
  await vi.advanceTimersByTimeAsync(160)
  expect(h.list.scrollTop).toBe(stopped)
  h.drag.pointer(h.event(h.list, 25))
  await vi.advanceTimersByTimeAsync(160)
  expect(h.list.scrollTop).toBeLessThan(stopped)
  h.drag.reset()
  const canceled = h.list.scrollTop
  await vi.advanceTimersByTimeAsync(160)
  expect(h.list.scrollTop).toBe(canceled)
})
