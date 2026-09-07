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
  Hash,
  Info,
  Layers,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  Maximize2,
  MessageCircle,
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
  secondary?: unknown
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
      const { height, width } = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
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
                trigger.current?.focus()
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
  }: ModalProps): unknown {
    const dialog = React.useRef<HTMLDialogElement | null>(null)
    const ime = React.useMemo(createImeGuard, [])
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
          onKeyDown: (event: { key: string, nativeEvent: KeyboardEvent, preventDefault: () => void }) => {
            if (event.key === 'Enter' && ime.active(event.nativeEvent))
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
