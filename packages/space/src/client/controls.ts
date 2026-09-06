import type { ReactLike } from './types.ts'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  GitFork,
  Layers,
  LoaderCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SquarePen,
  Star,
  Trash2,
  X,
} from 'lucide'

const icons = {
  archive: Archive,
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
  star: Star,
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
}
interface ModalProps {
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
}
interface Controls {
  Icon: (props: IconProps) => unknown
  IconButton: (props: ButtonProps) => unknown
  Menu: (props: MenuProps) => unknown
  Modal: (props: ModalProps) => unknown
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
        'title': label,
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
  }: MenuProps): unknown {
    const panel = React.useRef<HTMLDivElement | null>(null)
    const trigger = React.useRef<HTMLButtonElement | null>(null)
    const [open, setOpen] = React.useState(false)
    const close = (): void => {
      panel.current?.hidePopover()
      setOpen(false)
    }
    const show = (): void => {
      const menu = panel.current
      const button = trigger.current
      if (!menu || !button)
        return
      if (open) {
        close()
        return
      }
      const rect = button.getBoundingClientRect()
      menu.showPopover()
      const height = menu.getBoundingClientRect().height
      menu.style.left = `${Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198))}px`
      menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`
      setOpen(true)
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    }
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
      },
      e(
        'button',
        {
          'ref': trigger,
          'type': 'button',
          'className': 'dsh-space-icon dsh-space-menu-trigger',
          'aria-label': label,
          'title': label,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          disabled,
          'onClick': show,
        },
        e(Icon, { name: icon }),
      ),
      e(
        'div',
        {
          'ref': panel,
          'popover': 'auto',
          'role': 'menu',
          'aria-label': label,
          'className': 'dsh-space-menu-panel',
          'onToggle': (event: { newState: string }) =>
            setOpen(event.newState === 'open'),
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
              close()
              trigger.current?.focus()
            }
          },
        },
        ...actions.map(action =>
          e(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              key: action.label,
              disabled: action.disabled,
              className: action.danger ? 'danger' : undefined,
              onClick: () => {
                close()
                trigger.current?.focus()
                action.run()
              },
            },
            e(Icon, { name: action.icon }),
            action.label,
          ),
        ),
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
  }: ModalProps): unknown {
    const dialog = React.useRef<HTMLDialogElement | null>(null)
    React.useEffect(() => {
      const previous = document.activeElement as HTMLElement | null
      const element = dialog.current!
      element.showModal()
      Array.from(element.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)'))
        .find(input => !input.closest('details:not([open])') && input.getClientRects().length > 0)
        ?.focus()
      return () => {
        element.close()
        if (previous?.isConnected)
          previous.focus()
      }
    }, [])
    return e(
      'dialog',
      {
        'ref': dialog,
        'className': 'dsh-space-dialog',
        'aria-label': title,
        'aria-busy': busy,
        'onCancel': (event: Event) => {
          event.preventDefault()
          if (!busy)
            onClose()
        },
      },
      e(
        'form',
        {
          className: 'dsh-space-form',
          onSubmit: (event: Event) => {
            event.preventDefault()
            if (!busy && !submitDisabled)
              onSubmit?.()
          },
        },
        e(
          'header',
          { className: 'dsh-space-dialog-header' },
          e('h2', null, title),
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
