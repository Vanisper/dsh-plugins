// @vitest-environment jsdom
import type { NativePicker } from './native-picker.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { createNativePicker, nativePickerActive } from './native-picker.ts'

const pickers: NativePicker[] = []
afterEach(() => {
  pickers.splice(0).forEach(picker => picker.dispose())
  vi.restoreAllMocks()
  document.body.replaceChildren()
  expect(nativePickerActive()).toBe(false)
})

function create(open: () => Promise<string | null>): NativePicker {
  const picker = createNativePicker(open)
  pickers.push(picker)
  return picker
}

function key(type = 'keydown'): KeyboardEvent {
  const event = new KeyboardEvent(type, { key: 'Escape', bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  return event
}

it.each(['选择', '取消', '失败'])('原生请求%s后释放所有输入拦截，不提前接收结果', async (outcome) => {
  let resolve!: (path: string | null) => void
  let reject!: (error: Error) => void
  const picker = create(() => new Promise((done, fail) => {
    resolve = done
    reject = fail
  }))
  const accept = vi.fn()
  const result = picker.pick(accept).catch(error => error)
  expect(nativePickerActive()).toBe(true)
  for (const type of ['keydown', 'keyup', 'keypress'])
    expect(key(type).defaultPrevented).toBe(true)
  for (const type of ['pointerdown', 'click', 'wheel', 'touchmove', 'dragenter', 'dragover', 'dragleave', 'drop']) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  expect(accept).not.toHaveBeenCalled()
  if (outcome === '失败')
    reject(new Error('picker failed'))
  else
    resolve(outcome === '选择' ? '/picked' : null)
  const value = await result
  if (outcome === '失败')
    expect(value).toBeInstanceOf(Error)
  expect(accept).toHaveBeenCalledTimes(outcome === '选择' ? 1 : 0)
  expect(nativePickerActive()).toBe(false)
  expect(key().defaultPrevented).toBe(false)
})

it('同步抛错和接收方抛错都释放输入拦截', async () => {
  const failed = create(() => {
    throw new Error('open failed')
  })
  await expect(failed.pick(vi.fn())).rejects.toThrow('open failed')
  expect(nativePickerActive()).toBe(false)
  const accepted = create(async () => '/picked')
  await expect(accepted.pick(() => {
    throw new Error('accept failed')
  })).rejects.toThrow('accept failed')
  expect(key().defaultPrevented).toBe(false)
})

it('卸载后立即释放拦截，原生窗口稍后返回时不再写入旧草稿', async () => {
  let finish!: (path: string) => void
  const picker = create(() => new Promise((resolve) => {
    finish = resolve
  }))
  const accept = vi.fn()
  const result = picker.pick(accept)
  picker.dispose()
  expect(key().defaultPrevented).toBe(false)
  finish('/late')
  await result
  expect(accept).not.toHaveBeenCalled()
})

it('同一入口不重复打开，多个调用方不提前解除另一个选择器的锁', async () => {
  let firstDone!: (path: null) => void
  let secondDone!: (path: null) => void
  const firstOpen = vi.fn(() => new Promise<null>((resolve) => {
    firstDone = resolve
  }))
  const first = create(firstOpen)
  const second = create(() => new Promise((resolve) => {
    secondDone = resolve
  }))
  const a = first.pick(vi.fn())
  await first.pick(vi.fn())
  expect(firstOpen).toHaveBeenCalledOnce()
  const b = second.pick(vi.fn())
  firstDone(null)
  await a
  expect(key().defaultPrevented).toBe(true)
  secondDone(null)
  await b
  expect(key().defaultPrevented).toBe(false)
})
