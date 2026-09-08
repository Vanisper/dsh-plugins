import type { ReactLike } from './types.ts'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Clock,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  GitFork,
  Hand,
  Hash,
  Info,
  Layers,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  MessageCirclePlus,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SquarePen,
  Target,
  Trash2,
  X,
} from 'lucide'
import { createImeGuard } from './ime.ts'

const icons = {
  plan: Lightbulb,
  goal: Target,
  cancel: CircleX,
  archive: Archive,
  restore: ArchiveRestore,
  clock: Clock,
  hash: Hash,
  hand: Hand,
  filter: ListFilter,
  expand: Maximize2,
  collapse: Minimize2,
  down: ArrowDown,
  up: ArrowUp,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  more: Ellipsis,
  folder: Folder,
  open: FolderOpen,
  folderPlus: FolderPlus,
  fork: GitFork,
  info: Info,
  layers: Layers,
  loading: LoaderCircle,
  edit: Pencil,
  pin: Pin,
  unpin: PinOff,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings2,
  chat: SquarePen,
  message: MessageCircle,
  newMessage: MessageCirclePlus,
  external: ArrowUpRight,
  remove: Trash2,
  close: X,
}
export type IconName = keyof typeof icons

export interface MenuAction {
  label: string
  icon: IconName
  run: () => void
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  group?: string
}

interface IconProps {
  name: IconName
  size?: number
}
interface ButtonProps {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}
interface MenuProps {
  label: string
  actions: MenuAction[]
  disabled?: boolean
  icon?: IconName
  badge?: IconName
}
interface ModalProps {
  headingControl?: unknown
  workspace?: boolean
  compact?: boolean
  explicitSubmit?: boolean
  title: string
  busy: boolean
  error?: string
  children?: unknown
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  fieldsDisabled?: boolean
  cancelLabel?: string
  danger?: boolean
  secondary?: unknown
}
interface Controls {
  Icon: (props: IconProps) => unknown
  IconButton: (props: ButtonProps) => unknown
  Menu: (props: MenuProps) => unknown
  Modal: (props: ModalProps) => unknown
}

export const hasOpenMenu = (): boolean => !!document.querySelector('.dsh-space-menu-backdrop')
let hint: HTMLElement | undefined
let hintTimer: ReturnType<typeof setTimeout> | undefined
let quietFocus = false
function hideHint(): void {
  clearTimeout(hintTimer)
  hint?.remove()
  hint = undefined
}

/** 自动聚焦和焦点恢复不触发提示，主动悬停及键盘聚焦仍保留提示 */
export function withoutFocusHint(action: () => void): void {
  const previous = quietFocus
  quietFocus = true
  hideHint()
  try {
    action()
  }
  finally {
    quietFocus = previous
  }
}

/** 使用顶层提示，避免侧栏滚动容器裁切或触发浏览器原生提示 */
export function tooltipProps(label: string): Record<string, unknown> {
  const show = (event: { currentTarget: HTMLElement }): void => {
    hideHint()
    const anchor = event.currentTarget
    hintTimer = setTimeout(() => {
      if (!anchor.isConnected || hasOpenMenu() || document.body.hasAttribute('data-dsh-space-dragging'))
        return
      const node = document.createElement('div')
      node.textContent = label
      node.setAttribute('role', 'tooltip')
      node.setAttribute('popover', 'manual')
      node.style.cssText = 'position:fixed;inset:auto;margin:0;padding:5px 8px;border:0;border-radius:6px;background:#292a2d;color:#fff;font:12px/1.5 system-ui,sans-serif;max-width:240px;overflow-wrap:anywhere;pointer-events:none;box-shadow:0 2px 8px #0002;'
      ;(anchor.closest('dialog, [role="dialog"]') ?? document.body).append(node)
      node.showPopover()
      const rect = anchor.getBoundingClientRect()
      const size = node.getBoundingClientRect()
      node.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - size.width) / 2, innerWidth - size.width - 8))}px`
      node.style.top = `${rect.bottom + size.height + 8 > innerHeight ? Math.max(8, rect.top - size.height - 6) : rect.bottom + 6}px`
      hint = node
    }, 450)
  }
  return {
    onPointerEnter: show,
    onPointerLeave: hideHint,
    onFocus: (event: { currentTarget: HTMLElement }) => {
      if (!quietFocus)
        show(event)
    },
    onBlur: hideHint,
    onPointerDown: hideHint,
    onClickCapture: hideHint,
  }
}

export function createControls(React: ReactLike): Controls {
  const e = React.createElement
  function Icon({
    name,
    size = 16,
  }: {
    name: IconName
    size?: number
  }): unknown {
    const [tag, attrs, nodes] = icons[name]
    return e(
      tag,
      {
        ...Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])),
        'width': size,
        'height': size,
        'strokeWidth': 1.75,
        'strokeLinecap': 'round',
        'strokeLinejoin': 'round',
        'aria-hidden': true,
        'focusable': false,
      },
      ...nodes!.map(([tag, attrs], key) => e(tag, { ...attrs, key })),
    )
  }
  function IconButton({
    icon,
    label,
    onClick,
    disabled,
    className = '',
  }: {
    icon: IconName
    label: string
    onClick: () => void
    disabled?: boolean
    className?: string
  }): unknown {
    return e(
      'button',
      {
        'type': 'button',
        'className': `dsh-space-icon ${className}`,
        ...tooltipProps(label),
        'aria-label': label,
        'disabled': disabled,
        onClick,
      },
      e(Icon, { name: icon }),
    )
  }
  function Menu({
    label,
    actions,
    disabled,
    icon = 'more',
    badge,
  }: MenuProps): unknown {
    const panel = React.useRef<HTMLDivElement | null>(null)
    const trigger = React.useRef<HTMLButtonElement | null>(null)
    const backdrop = React.useRef<HTMLDivElement | null>(null)
    const [open, setOpen] = React.useState(false)
    const clearBackdrop = (): void => {
      backdrop.current?.remove()
      backdrop.current = null
    }
    const close = (): void => {
      panel.current?.hidePopover()
      clearBackdrop()
      setOpen(false)
    }
    const show = (position?: { x: number, y: number }): void => {
      const menu = panel.current
      const button = trigger.current
      if (!menu || !button)
        return
      if (open && !position) {
        close()
        return
      }
      if (open)
        menu.hidePopover()
      const rect = button.getBoundingClientRect()
      clearBackdrop()
      // 拦截层先进入顶层，菜单在它上方；关闭时不会把首次点击交给背景控件
      const shield = document.createElement('div')
      shield.className = 'dsh-space-menu-backdrop'
      shield.setAttribute('popover', 'manual')
      shield.setAttribute('aria-hidden', 'true')
      const stop = (event: Event): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      shield.addEventListener('pointerdown', stop)
      shield.addEventListener('wheel', stop, { passive: false })
      shield.addEventListener('touchmove', stop, { passive: false })
      const dismiss = (event: Event): void => {
        stop(event)
        close()
        withoutFocusHint(() => button.focus())
      }
      shield.addEventListener('click', dismiss)
      shield.addEventListener('contextmenu', (event) => {
        stop(event)
        close()
        const target = document.elementFromPoint(event.clientX, event.clientY)
        // 右键切换到指针下的菜单，左键仍只关闭拦截层，不执行背景动作
        if (target?.closest('.dsh-space-root, .dsh-space-dialog')) {
          const context = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: event.clientX,
            clientY: event.clientY,
          })
          if (!target.dispatchEvent(context))
            return
        }
        withoutFocusHint(() => button.focus())
      })
      ;(button.closest('dialog, [role="dialog"]') ?? document.body).append(shield)
      backdrop.current = shield
      shield.showPopover()
      hideHint()
      window.dispatchEvent(new CustomEvent('dsh-space-menu-open', { detail: menu }))
      menu.showPopover()
      const { height, width } = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(8, Math.min(position?.x ?? rect.left, window.innerWidth - width - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(position?.y ?? rect.bottom + 4, window.innerHeight - height - 8))}px`
      setOpen(true)
      withoutFocusHint(() => menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    }
    React.useEffect(() => {
      const menu = panel.current!
      const toggle = (event: Event): void => {
        const active = (event as ToggleEvent).newState === 'open'
        setOpen(active)
        if (!active)
          clearBackdrop()
      }
      const otherMenu = (event: Event): void => {
        if ((event as CustomEvent).detail !== menu && backdrop.current)
          close()
      }
      // 宿主 React 对 toggle 的支持不一致，直接订阅原生事件同步关闭状态
      menu.addEventListener('toggle', toggle)
      window.addEventListener('dsh-space-menu-open', otherMenu)
      return () => {
        menu.removeEventListener('toggle', toggle)
        window.removeEventListener('dsh-space-menu-open', otherMenu)
        clearBackdrop()
        hideHint()
      }
    }, [])
    React.useEffect(() => {
      if (!open)
        return
      const dismiss = (): void => close()
      window.addEventListener('resize', dismiss)
      return () => window.removeEventListener('resize', dismiss)
    }, [open])
    return e(
      'span',
      {
        className: 'dsh-space-menu',
        onClick: (event: Event) => event.stopPropagation(),
        onContextMenu: (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          if (disabled || (event.target instanceof Node && panel.current?.contains(event.target)))
            return
          const rect = trigger.current!.getBoundingClientRect()
          show(event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom + 4 })
        },
      },
      e(
        'button',
        {
          'ref': trigger,
          'type': 'button',
          'className': 'dsh-space-icon dsh-space-menu-trigger',
          'aria-label': label,
          ...tooltipProps(label),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          disabled,
          'onClick': () => show(),
        },
        e(Icon, { name: icon }),
        badge ? e('span', { className: 'dsh-space-sort-badge' }, e(Icon, { name: badge, size: 9 })) : null,
      ),
      e(
        'div',
        {
          'ref': panel,
          // 右键 contextmenu 发生在 pointerup 前，auto 会把刚打开的菜单轻关闭
          'popover': 'manual',
          'role': 'menu',
          'aria-label': label,
          'className': 'dsh-space-menu-panel',
          'onKeyDown': (event: KeyboardEvent) => {
            const buttons = Array.from(
              panel.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              ) ?? [],
            )
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            )
            const next
              = event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : event.key === 'ArrowDown'
                    ? (index + 1) % buttons.length
                    : event.key === 'ArrowUp'
                      ? (index - 1 + buttons.length) % buttons.length
                      : undefined
            if (next !== undefined) {
              event.preventDefault()
              buttons[next]?.focus()
            }
            if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
              }
              close()
              withoutFocusHint(() => trigger.current?.focus())
            }
          },
        },
        ...actions.flatMap((action, index) => [
          index > 0 && action.group !== actions[index - 1]!.group
            ? e('div', { role: 'separator', key: `separator:${action.label}` })
            : null,
          e(
            'button',
            {
              'type': 'button',
              'role': action.checked === undefined ? 'menuitem' : 'menuitemradio',
              'aria-checked': action.checked,
              'key': action.label,
              'disabled': action.disabled,
              'className': action.danger ? 'danger' : undefined,
              'onClick': () => {
                close()
                withoutFocusHint(() => trigger.current?.focus())
                action.run()
              },
            },
            e(Icon, { name: action.icon }),
            action.label,
            action.checked ? e('span', { className: 'dsh-space-menu-check' }, e(Icon, { name: 'check', size: 14 })) : null,
          ),
        ]),
      ),
    )
  }
  function Modal({
    title,
    busy,
    error,
    children,
    onClose,
    onSubmit,
    submitLabel = '保存',
    submitDisabled,
    fieldsDisabled,
    cancelLabel,
    danger,
    secondary,
    compact,
    workspace,
    explicitSubmit,
    headingControl,
  }: ModalProps): unknown {
    const dialog = React.useRef<HTMLDialogElement | null>(null)
    const ime = React.useMemo(createImeGuard, [])
    React.useEffect(() => {
      const previous = document.activeElement as HTMLElement | null
      const element = dialog.current!
      withoutFocusHint(() => {
        element.showModal()
        Array.from(element.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)'))
          .find(input => !input.closest('details:not([open])') && input.getClientRects().length > 0)
          ?.focus()
      })
      // 宿主在 document 上接收所有 Files；模态遮罩不阻止拖拽事件冒泡
      const fileEvents = ['dragenter', 'dragover', 'dragleave', 'drop'] as const
      const blockFiles = (event: DragEvent): void => {
        if (!element.open || !event.dataTransfer?.types.includes('Files'))
          return
        event.preventDefault()
        event.stopImmediatePropagation()
        event.dataTransfer.dropEffect = 'none'
      }
      for (const type of fileEvents)
        window.addEventListener(type, blockFiles, true)
      return () => {
        for (const type of fileEvents)
          window.removeEventListener(type, blockFiles, true)
        withoutFocusHint(() => {
          element.close()
          if (previous?.isConnected)
            previous.focus()
        })
      }
    }, [])
    return e(
      'dialog',
      {
        'ref': dialog,
        'className': `dsh-space-dialog${compact ? ' compact' : ''}${workspace ? ' workspace-editor' : ''}`,
        'aria-label': title,
        'aria-busy': busy,
        'closedby': busy ? 'none' : 'closerequest',
        'onCancel': (event: Event) => {
          event.preventDefault()
          if (!busy && !ime.active())
            onClose()
        },
      },
      e(
        'form',
        {
          className: 'dsh-space-form',
          onCompositionStart: ime.start,
          onCompositionEnd: ime.end,
          onKeyDown: (event: { key: string, target: HTMLElement, nativeEvent: KeyboardEvent, preventDefault: () => void }) => {
            if (event.key === 'Enter' && (ime.active(event.nativeEvent) || (explicitSubmit && event.target.tagName !== 'BUTTON')))
              event.preventDefault()
          },
          onSubmit: (event: Event) => {
            event.preventDefault()
            if (!busy && !submitDisabled && !ime.active())
              onSubmit?.()
          },
        },
        e(
          'header',
          { className: 'dsh-space-dialog-header' },
          e('h2', null, title),
          headingControl,
          e(IconButton, {
            icon: 'close',
            label: '关闭',
            disabled: busy,
            onClick: onClose,
          }),
        ),
        e(
          'div',
          { className: 'dsh-space-dialog-body' },
          e(
            'fieldset',
            { className: 'dsh-space-fields', disabled: busy || fieldsDisabled },
            children,
          ),
        ),
        error
          ? e(
              'div',
              { className: 'dsh-space-notice dsh-space-error', role: 'alert' },
              error,
            )
          : null,
        e(
          'footer',
          { className: 'dsh-space-buttons' },
          secondary ? e('div', { className: 'dsh-space-dialog-secondary' }, secondary) : null,
          e(
            'button',
            {
              type: 'button',
              className: 'dsh-space-button',
              disabled: busy,
              onClick: onClose,
            },
            cancelLabel ?? (onSubmit ? '取消' : '关闭'),
          ),
          onSubmit
            ? e(
                'button',
                {
                  type: 'submit',
                  className: `dsh-space-button ${danger ? 'danger' : 'primary'}`,
                  disabled: busy || submitDisabled,
                },
                busy ? e(Icon, { name: 'loading' }) : null,
                busy ? '处理中…' : submitLabel,
              )
            : null,
        ),
      ),
    )
  }
  return { Icon, IconButton, Menu, Modal }
}
