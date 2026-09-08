// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installScrollFade } from './scroll-fade.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('顶端、滚动中、底端及不溢出的列表分别显示对应渐隐，滚动条宽度独立保留', () => {
  const element = document.createElement('div')
  element.append(document.createElement('div'))
  document.body.append(element)
  const size = { height: 800, viewport: 400 }
  Object.defineProperties(element, {
    scrollHeight: { get: () => size.height },
    clientHeight: { get: () => size.viewport },
    offsetWidth: { get: () => 280 },
    clientWidth: { get: () => 265 },
  })
  let resized!: () => void
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe = observe
    disconnect = disconnect
  })
  const dispose = installScrollFade(element)
  const fades = (): boolean[] => ['top', 'bottom'].map(side => element.hasAttribute(`data-fade-${side}`))
  expect(fades()).toEqual([false, true])
  expect(element.style.getPropertyValue('--dsh-space-scrollbar-width')).toBe('15px')
  expect(observe.mock.calls.map(([target]) => target)).toEqual([element, element.firstElementChild])
  element.scrollTop = 100
  element.dispatchEvent(new Event('scroll'))
  expect(fades()).toEqual([true, true])
  element.scrollTop = 400
  element.dispatchEvent(new Event('scroll'))
  expect(fades()).toEqual([true, false])
  size.height = 400
  element.scrollTop = 0
  resized()
  expect(fades()).toEqual([false, false])
  size.height = 600
  window.dispatchEvent(new Event('resize'))
  expect(fades()).toEqual([false, true])
  dispose()
  expect(disconnect).toHaveBeenCalledOnce()
  element.scrollTop = 50
  element.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new Event('resize'))
  expect(fades()).toEqual([false, false])
  expect(element.style.getPropertyValue('--dsh-space-scrollbar-width')).toBe('')
})
