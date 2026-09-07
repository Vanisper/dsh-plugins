import type { IconName } from './controls.ts'
import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'
import { createImeGuard } from './ime.ts'

interface DetailsProps {
  title: string
  icon: IconName
  variant: 'session' | 'workspace'
  label: string
  anchor: HTMLElement
  edit: boolean
  focus: boolean
  children?: unknown
  action?: unknown
  onRename: (title: string) => Promise<void>
  onClose: (reason?: 'leave') => void
  onDetachedError: (error: unknown) => void
  onEnter: () => void
}

/** 信息浮层统一处理定位、原位改名和草稿退出，不持有领域身份 */
export function createDetails(React: ReactLike): (props: DetailsProps) => unknown {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  return function Details(props: DetailsProps): unknown {
    const { title, label, anchor, onClose, onRename } = props
    const [editing, setEditing] = React.useState(props.edit)
    const [draft, setDraft] = React.useState(title)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const panel = React.useRef<HTMLDivElement | null>(null)
    const input = React.useRef<HTMLInputElement | null>(null)
    const editButton = React.useRef<HTMLButtonElement | null>(null)
    const busyRef = React.useRef(false)
    const mounted = React.useRef(false)
    const pointerMode = React.useRef(!props.focus)
    const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const ime = React.useMemo(createImeGuard, [])
    const latest = React.useRef(props)
    latest.current = props
    const keepOpen = (): void => {
      clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
    const leave = (): void => {
      if (closeTimer.current === undefined) {
        closeTimer.current = setTimeout(() => {
          closeTimer.current = undefined
          latest.current.onClose('leave')
        }, 220)
      }
    }
    React.useEffect(() => {
      mounted.current = true
      const element = panel.current!
      const row = anchor.closest('.dsh-space-head, .dsh-space-session') ?? anchor
      element.showPopover()
      const position = (): void => {
        const rect = row.getBoundingClientRect()
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
        if (!element.contains(event.target as Node) && !anchor.contains(event.target as Node))
          latest.current.onClose()
      }
      const enter = (event: PointerEvent): void => {
        if (!pointerMode.current || event.pointerType !== 'mouse')
          return
        if (row.contains(event.target as Node) || element.contains(event.target as Node))
          keepOpen()
        else
          leave()
      }
      const exit = (event: PointerEvent): void => {
        if (pointerMode.current && event.pointerType === 'mouse' && !event.relatedTarget)
          leave()
      }
      const escape = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || ime.active(event))
          return
        event.preventDefault()
        event.stopPropagation()
        latest.current.onClose()
        anchor.focus()
      }
      window.addEventListener('resize', position)
      window.addEventListener('scroll', position, true)
      document.addEventListener('pointerdown', outside)
      document.addEventListener('pointerover', enter)
      document.addEventListener('pointerout', exit)
      document.addEventListener('keydown', escape, true)
      return () => {
        mounted.current = false
        keepOpen()
        observer?.disconnect()
        window.removeEventListener('resize', position)
        window.removeEventListener('scroll', position, true)
        document.removeEventListener('pointerdown', outside)
        document.removeEventListener('pointerover', enter)
        document.removeEventListener('pointerout', exit)
        document.removeEventListener('keydown', escape, true)
      }
    }, [])
    React.useEffect(() => {
      if (editing) {
        input.current?.focus()
        input.current?.select()
      }
    }, [editing])
    const save = (): void => {
      if (busyRef.current || ime.active() || !draft.trim() || draft.trim() === title)
        return
      busyRef.current = true
      setBusy(true)
      setError('')
      void Promise.resolve().then(() => onRename(draft.trim())).then(() => {
        if (mounted.current)
          latest.current.onClose()
      }).catch((cause) => {
        if (mounted.current)
          setError(cause instanceof Error ? cause.message : String(cause))
        else
          latest.current.onDetachedError(cause)
      }).finally(() => {
        busyRef.current = false
        if (mounted.current)
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
        'onPointerEnter': (event: { pointerType: string }) => {
          if (event.pointerType === 'mouse')
            pointerMode.current = true
          keepOpen()
          props.onEnter()
        },
        'onPointerLeave': (event: { pointerType: string }) => {
          if (event.pointerType === 'mouse')
            leave()
        },
        'onBlur': (event: { relatedTarget: Node | null }) => {
          if (event.relatedTarget && !panel.current?.contains(event.relatedTarget))
            onClose()
        },
        'onClick': (event: { target: Element }) => {
          if (editing && !event.target.closest('.dsh-space-name-editor'))
            onClose()
        },
      },
      e(
        'header',
        { className: 'dsh-space-details-header' },
        e('div', { className: 'dsh-space-name-editor' }, e('span', {
          className: 'dsh-space-detail-type',
          onPointerDown: (event: Event) => event.preventDefault(),
          onClick: () => input.current?.focus(),
        }, e(Icon, { name: props.icon })), editing
          ? e(
              'form',
              {
                className: 'dsh-space-inline-rename',
                onCompositionStart: ime.start,
                onCompositionEnd: ime.end,
                onKeyDown: (event: { key: string, nativeEvent: KeyboardEvent, preventDefault: () => void }) => {
                  if (event.key === 'Enter' && ime.active(event.nativeEvent))
                    event.preventDefault()
                },
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
                },
              },
              title,
              e(Icon, { name: 'edit', size: 14 }),
            )),
        props.action,
      ),
      error ? e('div', { className: 'dsh-space-error', role: 'alert' }, error) : null,
      e('div', { className: 'dsh-space-details-body' }, props.children),
    )
  }
}
