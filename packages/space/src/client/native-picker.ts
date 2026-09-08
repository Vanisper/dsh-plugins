import { withoutFocusHint } from './controls.ts'

const listeners = new Set<() => void>()
let pending = 0

export function nativePickerActive(): boolean {
  return pending > 0
}

export function subscribeNativePicker(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function holdPageInput(): () => void {
  const events = ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop']
  const block = (event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    const transfer = (event as DragEvent).dataTransfer
    if (transfer)
      transfer.dropEffect = 'none'
  }
  for (const event of events)
    window.addEventListener(event, block, { capture: true, passive: false })
  pending++
  listeners.forEach(listener => listener())
  let released = false
  return () => {
    if (released)
      return
    released = true
    for (const event of events)
      window.removeEventListener(event, block, true)
    pending--
    listeners.forEach(listener => listener())
  }
}

export interface NativePicker {
  /** 选择器等待期间屏蔽网页输入，仅将有效选择交给当前仍挂载的调用方 */
  pick: (accept: (path: string) => void, trigger?: HTMLElement) => Promise<void>
  dispose: () => void
}

/** 原生选择器不属于网页模态层，不能依赖 DOM 焦点约束阻止后台操作 */
export function createNativePicker(open: () => Promise<string | null>): NativePicker {
  let disposed = false
  let release: (() => void) | undefined
  let frame: number | undefined
  return {
    async pick(accept, trigger): Promise<void> {
      if (disposed || release)
        return
      if (frame !== undefined) {
        cancelAnimationFrame(frame)
        frame = undefined
      }
      const unlock = holdPageInput()
      release = unlock
      try {
        const path = await open()
        if (!disposed && path)
          accept(path)
      }
      finally {
        unlock()
        release = undefined
        if (!disposed) {
          // 等待调用方清除 busy 并恢复按钮，不在原生选择器等待期间回拉焦点
          frame = requestAnimationFrame(() => {
            frame = undefined
            if (!disposed && trigger?.isConnected && !trigger.matches(':disabled') && document.hasFocus() && !nativePickerActive())
              withoutFocusHint(() => trigger.focus({ preventScroll: true }))
          })
        }
      }
    },
    dispose(): void {
      disposed = true
      release?.()
      release = undefined
      if (frame !== undefined)
        cancelAnimationFrame(frame)
    },
  }
}
