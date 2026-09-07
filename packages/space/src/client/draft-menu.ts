import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

interface DraftMenuProps {
  open: boolean
  onClose: () => void
  onAddImages: () => void
}

/** 草稿菜单不查询或执行需要 Session 的命令 */
export function createDraftMenu(React: ReactLike): (props: DraftMenuProps) => unknown {
  const e = React.createElement
  const { Icon } = createControls(React)
  return function DraftMenu({ open, onClose, onAddImages }): unknown {
    const panel = React.useRef<HTMLDivElement | null>(null)
    const previous = React.useRef<HTMLElement | null>(null)
    const close = (restoreFocus = false): void => {
      panel.current?.hidePopover()
      if (restoreFocus && previous.current?.isConnected)
        previous.current.focus({ preventScroll: true })
      onClose()
    }
    React.useEffect(() => {
      const menu = panel.current!
      if (!open) {
        menu.hidePopover()
        return
      }
      previous.current = document.activeElement as HTMLElement | null
      const anchor = menu.parentElement!.getBoundingClientRect()
      menu.showPopover()
      const rect = menu.getBoundingClientRect()
      const top = anchor.top >= rect.height + 16 ? anchor.top - rect.height - 8 : anchor.bottom + 8
      menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))}px`
      menu.querySelector<HTMLButtonElement>('[role=option]')?.focus({ preventScroll: true })
      const resize = (): void => close(true)
      window.addEventListener('resize', resize)
      return () => {
        window.removeEventListener('resize', resize)
        menu.hidePopover()
      }
    }, [open])
    return e('div', {
      'ref': panel,
      'popover': 'auto',
      'role': 'listbox',
      'aria-label': '命令',
      'className': 'dsh-space-menu-panel dsh-space-draft-menu',
      'onToggle': (event: { newState: string }) => {
        if (event.newState === 'closed')
          onClose()
      },
      'onKeyDown': (event: KeyboardEvent & { nativeEvent: KeyboardEvent }) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>('[role=option]')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : undefined
        if (next !== undefined) {
          event.preventDefault()
          buttons[next]?.focus()
        }
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape')
            event.preventDefault()
          close(true)
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          buttons[index]?.click()
        }
        event.stopPropagation()
      },
    }, e('button', {
      'type': 'button',
      'role': 'option',
      'aria-selected': false,
      'tabIndex': -1,
      'onClick': () => {
        if (!open)
          return
        close(true)
        onAddImages()
      },
    }, e(Icon, { name: 'image' }), '添加图片'), e('button', {
      'type': 'button',
      'role': 'option',
      'aria-selected': false,
      'aria-disabled': true,
      'tabIndex': -1,
      'title': '首次发送并创建会话后可用',
    }, e(Icon, { name: 'terminal' }), e('span', null, '会话命令', e('small', null, '首次发送并创建会话后可用'))))
  }
}
