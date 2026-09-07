import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

interface DetailsProps {
  title: string
  variant: 'session' | 'workspace'
  label: string
  anchor: HTMLElement
  edit: boolean
  focus: boolean
  children?: unknown
  onRename: (title: string) => Promise<void>
  onClose: () => void
  onEditingChange: (editing: boolean) => void
  onEnter: () => void
  onLeave: () => void
}

/** 信息浮层统一处理定位、原位改名和草稿退出，不持有领域身份 */
export function createDetails(React: ReactLike): (props: DetailsProps) => unknown {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  return function Details(props: DetailsProps): unknown {
    const { title, label, anchor, onClose, onRename, onEditingChange } = props
    const [editing, setEditing] = React.useState(props.edit)
    const [draft, setDraft] = React.useState(title)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const panel = React.useRef<HTMLDivElement | null>(null)
    const input = React.useRef<HTMLInputElement | null>(null)
    const editButton = React.useRef<HTMLButtonElement | null>(null)
    const busyRef = React.useRef(false)
    const latest = React.useRef({ editing, title, onClose, onEditingChange })
    latest.current = { editing, title, onClose, onEditingChange }
    const cancel = (): void => {
      if (busyRef.current)
        return
      setDraft(latest.current.title)
      setError('')
      setEditing(false)
      latest.current.onEditingChange(false)
    }
    React.useEffect(() => {
      const element = panel.current!
      element.showPopover()
      const position = (): void => {
        const rect = (anchor.closest('.dsh-space-head, .dsh-space-session') ?? anchor).getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        const right = rect.right + 8
        const left = right + bounds.width <= window.innerWidth - 8 ? right : rect.left - bounds.width - 8
        element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`
        element.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - bounds.height - 8))}px`
      }
      position()
      if (props.focus && !props.edit)
        editButton.current?.focus()
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(position)
      observer?.observe(element)
      const outside = (event: PointerEvent): void => {
        if (!busyRef.current && !latest.current.editing && !element.contains(event.target as Node) && !anchor.contains(event.target as Node))
          latest.current.onClose()
      }
      const escape = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape')
          return
        event.preventDefault()
        event.stopPropagation()
        if (busyRef.current)
          return
        if (latest.current.editing) {
          cancel()
          requestAnimationFrame(() => editButton.current?.focus())
        }
        else {
          latest.current.onClose()
          anchor.focus()
        }
      }
      window.addEventListener('resize', position)
      window.addEventListener('scroll', position, true)
      document.addEventListener('pointerdown', outside)
      document.addEventListener('keydown', escape, true)
      return () => {
        observer?.disconnect()
        window.removeEventListener('resize', position)
        window.removeEventListener('scroll', position, true)
        document.removeEventListener('pointerdown', outside)
        document.removeEventListener('keydown', escape, true)
        latest.current.onEditingChange(false)
      }
    }, [])
    React.useEffect(() => {
      onEditingChange(editing)
      if (editing) {
        input.current?.focus()
        input.current?.select()
      }
    }, [editing])
    const save = (): void => {
      if (busyRef.current || !draft.trim() || draft.trim() === title)
        return
      busyRef.current = true
      setBusy(true)
      setError('')
      void Promise.resolve().then(() => onRename(draft.trim())).then(() => {
        setEditing(false)
        onEditingChange(false)
      }).catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      }).finally(() => {
        busyRef.current = false
        setBusy(false)
      })
    }
    return e(
      'div',
      {
        'ref': panel,
        'popover': 'manual',
        'role': 'dialog',
        'aria-label': label,
        'aria-busy': busy,
        'className': `dsh-space-details ${props.variant}`,
        'onPointerEnter': props.onEnter,
        'onPointerLeave': props.onLeave,
      },
      e(
        'header',
        { className: 'dsh-space-details-header' },
        editing
          ? e(
              'form',
              {
                className: 'dsh-space-inline-rename',
                onSubmit: (event: Event) => {
                  event.preventDefault()
                  save()
                },
              },
              e('input', {
                'ref': input,
                'aria-label': '名称',
                'value': draft,
                'disabled': busy,
                'onChange': (event: { target: HTMLInputElement }) => setDraft(event.target.value),
              }),
              e(IconButton, { icon: busy ? 'loading' : 'check', label: '保存名称', disabled: busy || !draft.trim() || draft.trim() === title, onClick: save }),
              e(IconButton, { icon: 'close', label: '取消改名', disabled: busy, onClick: cancel }),
            )
          : e(
              'button',
              {
                ref: editButton,
                type: 'button',
                className: 'dsh-space-details-title',
                title: '重命名',
                onClick: () => {
                  setDraft(title)
                  setEditing(true)
                  onEditingChange(true)
                },
              },
              title,
              e(Icon, { name: 'edit', size: 14 }),
            ),
        !editing
          ? e(IconButton, {
              icon: 'close',
              label: '关闭信息',
              onClick: () => {
                onClose()
                anchor.focus()
              },
            })
          : null,
      ),
      error ? e('div', { className: 'dsh-space-error', role: 'alert' }, error) : null,
      e('fieldset', { className: 'dsh-space-details-body', disabled: editing || busy }, props.children),
    )
  }
}
