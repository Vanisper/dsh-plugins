import type { Pin, SectionId } from './layout.ts'
import { pinKey } from './layout.ts'

export type DragSource = { kind: 'workspace' | 'session' | 'group', id: string } | { kind: 'section', id: SectionId } | { kind: 'pin', pin: Pin }
export interface DropTarget { kind: 'workspace' | 'session' | 'section' | 'group' | 'pin' | 'assign', id: string, after: boolean }
interface DragState { source?: DragSource, target?: DropTarget, previews: readonly string[] }
export interface SidebarDrag {
  getSnapshot: () => DragState
  subscribe: (listener: () => void) => () => void
  start: (source: DragSource, event: DragEvent) => void
  over: (target: DropTarget, event: DragEvent, preview?: string) => void
  leave: (event: DragEvent) => void
  pointer: (event: DragEvent) => void
  reset: () => void
  validate: () => void
  install: () => () => void
}

/** 所有落点以实际接收块的上下半区为准 */
export function dropAfter(event: DragEvent): boolean {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY > rect.top + rect.height / 2
}

/** 仅持有拖动期状态，不写排序、归属或持久化折叠偏好 */
export function createSidebarDrag(scrollElement: () => HTMLElement | null): SidebarDrag {
  let state: DragState = { previews: [] }
  let sourceElement: HTMLElement | undefined
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  let previewKey: string | undefined
  let frame: number | undefined
  let point: { x: number, y: number } | undefined
  const listeners = new Set<() => void>()
  const publish = (next: DragState): void => {
    state = next
    listeners.forEach(listener => listener())
  }
  const clearPreview = (): void => {
    clearTimeout(previewTimer)
    previewTimer = undefined
    previewKey = undefined
  }
  const reset = (): void => {
    clearPreview()
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    point = undefined
    sourceElement?.removeAttribute('data-drag-source')
    sourceElement = undefined
    document.body.removeAttribute('data-dsh-space-dragging')
    if (state.source)
      publish({ previews: [] })
  }
  const scroll = (): void => {
    frame = undefined
    const element = scrollElement()
    if (!state.source || !element || !point)
      return
    const rect = element.getBoundingClientRect()
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
      const edge = Math.min(40, rect.height / 4)
      const distance = point.y < rect.top + edge ? point.y - rect.top - edge : point.y > rect.bottom - edge ? point.y - rect.bottom + edge : 0
      if (distance && edge) {
        const previous = element.scrollTop
        element.scrollTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, previous + distance / edge * 12))
        if (element.scrollTop !== previous) {
          element.dispatchEvent(new Event('scroll'))
          frame = requestAnimationFrame(scroll)
        }
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start(source, event) {
      reset()
      event.stopPropagation()
      sourceElement = event.currentTarget as HTMLElement
      sourceElement.setAttribute('data-drag-source', '')
      document.body.setAttribute('data-dsh-space-dragging', '')
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', source.kind === 'pin' ? source.pin.id : source.id)
      }
      publish({ source, previews: [] })
    },
    over(target, event, preview) {
      if (!state.source)
        return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = 'move'
      const sourceId = state.source.kind === 'pin' ? pinKey(state.source.pin) : state.source.id
      if (state.source.kind === target.kind && sourceId === target.id) {
        clearPreview()
        if (state.target)
          publish({ ...state, target: undefined })
        return
      }
      if (state.target?.kind !== target.kind || state.target.id !== target.id || state.target.after !== target.after)
        publish({ ...state, target })
      if (preview !== previewKey) {
        clearPreview()
        if (preview !== undefined && !state.previews.includes(preview)) {
          previewKey = preview
          previewTimer = setTimeout(() => {
            if (state.source)
              publish({ ...state, previews: [...state.previews, preview] })
          }, 650)
        }
      }
    },
    leave(event) {
      if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) {
        clearPreview()
        if (state.target)
          publish({ ...state, target: undefined })
      }
    },
    pointer(event) {
      if (!state.source)
        return
      point = { x: event.clientX, y: event.clientY }
      if (frame === undefined)
        frame = requestAnimationFrame(scroll)
    },
    reset,
    validate() {
      if (sourceElement && !sourceElement.isConnected)
        reset()
    },
    install() {
      const key = (event: KeyboardEvent): void => {
        if (state.source && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          reset()
        }
      }
      const outside = (event: DragEvent): void => {
        if (!event.relatedTarget && (event.target === document || event.target === document.documentElement))
          reset()
      }
      const dropped = (): void => {
        queueMicrotask(reset)
      }
      document.addEventListener('keydown', key, true)
      document.addEventListener('dragend', reset, true)
      document.addEventListener('drop', dropped)
      document.addEventListener('dragleave', outside)
      window.addEventListener('blur', reset)
      return () => {
        reset()
        document.removeEventListener('keydown', key, true)
        document.removeEventListener('dragend', reset, true)
        document.removeEventListener('drop', dropped)
        document.removeEventListener('dragleave', outside)
        window.removeEventListener('blur', reset)
      }
    },
  }
}
