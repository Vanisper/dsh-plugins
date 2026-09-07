import type { ReactLike, SidebarPrimitives } from './types.ts'
import { createControls } from './controls.ts'

/** 复用宿主 Toast，仅将本插件的反馈定位到侧栏底部 */
export function createFeedback(React: ReactLike, Toast: SidebarPrimitives['Toast']) {
  const e = React.createElement
  const { Icon } = createControls(React)
  return function Feedback({ text, anchor, onDone }: { text: string, anchor: HTMLElement | null, onDone: () => void }): unknown {
    const marker = React.useRef<HTMLSpanElement | null>(null)
    React.useEffect(() => {
      // 宿主 Toast 通过 portal 渲染，公开 anchor 仅控制横向位置
      const toast = marker.current?.closest<HTMLElement>('[role="alert"]')
      if (!toast || !anchor)
        return
      toast.setAttribute('role', 'status')
      const position = (): void => {
        const rect = anchor.getBoundingClientRect()
        const narrow = rect.width < 100
        const content = anchor.querySelector<HTMLElement>('.dsh-space-toolbar-shell')?.getBoundingClientRect() ?? rect
        const width = Math.min(narrow ? 320 : content.width, window.innerWidth - 24)
        const center = narrow ? window.innerWidth / 2 : content.left + content.width / 2
        Object.assign(toast.style, {
          top: 'auto',
          bottom: `${narrow ? 24 : Math.max(12, window.innerHeight - rect.bottom + 8)}px`,
          left: `${Math.max(width / 2 + 12, Math.min(center, window.innerWidth - width / 2 - 12))}px`,
          width: `${width}px`,
          maxWidth: 'calc(100vw - 24px)',
        })
      }
      position()
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(position)
      observer?.observe(anchor)
      window.addEventListener('resize', position)
      return () => {
        observer?.disconnect()
        window.removeEventListener('resize', position)
      }
    }, [anchor])
    return e(Toast, {
      text,
      onDone,
      icon: e('span', { className: 'dsh-space-toast-icon', ref: marker }, e(Icon, { name: 'check', size: 16 })),
    })
  }
}
