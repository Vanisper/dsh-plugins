import type { FocusTrap } from 'focus-trap'
import type { ReactLike, RegistryItem, RegistryPayload, WorkspaceService } from './types.ts'
import { createFocusTrap } from 'focus-trap'
import { createControls, withoutFocusHint } from './controls.ts'
import { createImeGuard } from './ime.ts'
import { projectRegistry } from './model.ts'
import { observeRegistry } from './registry.ts'

interface TargetPickerProps {
  anchorRef?: { current: HTMLElement | null }
  items?: RegistryItem[]
  selectedId?: string
  independent?: boolean
  disabled?: boolean
  error?: string
  onPick: (id?: string) => void
  onClose: () => void
  onRetry: () => void
  onCreate?: () => void
}

export interface HostWorkspacePickerProps {
  open: boolean
  anchorRef?: { current: HTMLElement | null }
  selectedId?: string
  onPick: (id: string) => void
  onClose: () => void
  independent?: boolean
  onIndependent?: () => void
  onCreate?: () => void
  disabled?: boolean
}

export function createTargetPicker(React: ReactLike): (props: TargetPickerProps) => unknown {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  return function TargetPicker({ anchorRef, items, selectedId, independent, disabled, error, onPick, onClose, onRetry, onCreate }: TargetPickerProps): unknown {
    const [query, setQuery] = React.useState('')
    const panel = React.useRef<HTMLDivElement | null>(null)
    const search = React.useRef<HTMLInputElement | null>(null)
    const close = React.useRef<() => void>(() => {})
    const callbacks = React.useRef({ onClose })
    callbacks.current = { onClose }
    const ime = React.useMemo(createImeGuard, [])
    const needle = query.trim().toLocaleLowerCase()
    const choices = (items ?? []).filter(item => item.kind !== 'chat' && `${item.title}\n${item.path}`.toLocaleLowerCase().includes(needle))
    React.useEffect(() => {
      const element = panel.current!
      const fallback = !anchorRef && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : undefined
      const currentAnchor = (): HTMLElement | undefined => {
        const anchor = anchorRef ? anchorRef.current : fallback
        return anchor?.isConnected ? anchor : undefined
      }
      const shield = document.createElement('div')
      shield.className = 'dsh-space-menu-backdrop'
      shield.setAttribute('popover', 'manual')
      shield.setAttribute('aria-hidden', 'true')
      let closed = false
      let trap: FocusTrap | undefined
      let observer: ResizeObserver | undefined
      let observedAnchor: HTMLElement | undefined
      const restoreFocus = (): void => {
        withoutFocusHint(() => currentAnchor()?.focus({ preventScroll: true }))
      }
      const dismiss = (restore = true): void => {
        if (closed)
          return
        closed = true
        trap?.deactivate()
        element.hidePopover()
        shield.remove()
        if (restore)
          restoreFocus()
        callbacks.current.onClose()
      }
      close.current = dismiss
      const stop = (event: Event): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      shield.addEventListener('pointerdown', stop)
      shield.addEventListener('wheel', stop, { passive: false })
      shield.addEventListener('touchmove', stop, { passive: false })
      shield.addEventListener('click', (event) => {
        stop(event)
        dismiss()
      })
      shield.addEventListener('contextmenu', (event) => {
        stop(event)
        dismiss(false)
        const target = document.elementFromPoint(event.clientX, event.clientY)
        if (target?.closest('.dsh-space-root, .dsh-space-dialog') && !target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: event.clientX, clientY: event.clientY })))
          return
        restoreFocus()
      })
      const position = (): void => {
        if (closed)
          return
        const anchor = currentAnchor()
        if (observer && observedAnchor !== anchor) {
          if (observedAnchor)
            observer.unobserve(observedAnchor)
          if (anchor)
            observer.observe(anchor)
          observedAnchor = anchor
        }
        const rect = anchor?.getBoundingClientRect() ?? { left: (innerWidth - 300) / 2, top: 8, bottom: 8 }
        const above = Math.max(0, rect.top - 14)
        const below = Math.max(0, innerHeight - rect.bottom - 14)
        const upwards = below < 240 && above > below
        element.style.maxHeight = `${Math.min(360, upwards ? above : below)}px`
        const size = element.getBoundingClientRect()
        element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - size.width - 8))}px`
        element.style.top = `${Math.max(8, Math.min(upwards ? rect.top - size.height - 6 : rect.bottom + 6, innerHeight - size.height - 8))}px`
      }
      const scroll = (event: Event): void => {
        if (!(event.target instanceof Node) || !element.contains(event.target))
          position()
      }
      const otherMenu = (event: Event): void => {
        if ((event as CustomEvent).detail !== element)
          dismiss(false)
      }
      const escape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && !ime.active(event)) {
          event.preventDefault()
          event.stopPropagation()
          dismiss()
        }
      }
      ;(currentAnchor()?.closest('dialog, [role="dialog"]') ?? document.body).append(shield)
      shield.showPopover()
      window.dispatchEvent(new CustomEvent('dsh-space-menu-open', { detail: element }))
      element.showPopover()
      position()
      trap = createFocusTrap(element, { initialFocus: search.current!, fallbackFocus: element, delayInitialFocus: false, returnFocusOnDeactivate: false, preventScroll: true, escapeDeactivates: false, allowOutsideClick: true })
      withoutFocusHint(() => trap!.activate())
      observer = new ResizeObserver(position)
      observer.observe(element)
      observedAnchor = currentAnchor()
      if (observedAnchor)
        observer.observe(observedAnchor)
      window.addEventListener('resize', position)
      window.addEventListener('scroll', scroll, true)
      window.addEventListener('dsh-space-menu-open', otherMenu)
      document.addEventListener('keydown', escape, true)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', position)
        window.removeEventListener('scroll', scroll, true)
        window.removeEventListener('dsh-space-menu-open', otherMenu)
        document.removeEventListener('keydown', escape, true)
        trap?.deactivate()
        element.hidePopover()
        shield.remove()
        if (!closed)
          restoreFocus()
        close.current = () => {}
      }
    }, [])
    const choose = (id?: string): void => {
      if (disabled)
        return
      close.current()
      onPick(id)
    }
    return e('div', {
      'ref': panel,
      'popover': 'manual',
      'role': 'dialog',
      'aria-label': '选择工作区',
      'tabIndex': -1,
      'className': 'dsh-space-target-picker',
      'onCompositionStart': ime.start,
      'onCompositionEnd': ime.end,
      'onKeyDown': (event: { key: string, target: HTMLElement, nativeEvent: KeyboardEvent, preventDefault: () => void, stopPropagation: () => void }) => {
        if (ime.active(event.nativeEvent))
          return
        const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>('.dsh-space-target-list button:not(:disabled), .dsh-space-target-footer button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown'
          ? (index + 1) % buttons.length
          : event.key === 'ArrowUp'
            ? index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length
            : event.target !== search.current && event.key === 'Home'
              ? 0
              : event.target !== search.current && event.key === 'End'
                ? buttons.length - 1
                : undefined
        if (next !== undefined) {
          event.preventDefault()
          event.stopPropagation()
          buttons[next]?.focus()
          buttons[next]?.scrollIntoView?.({ block: 'nearest' })
        }
        if (event.key === 'Enter' && event.target === search.current) {
          event.preventDefault()
          event.stopPropagation()
          if (choices[0])
            choose(choices[0].workspaceId)
        }
      },
    }, e('div', { className: 'dsh-space-target-search' }, e(Icon, { name: 'search', size: 15 }), e('input', {
      'ref': search,
      'aria-label': '搜索工作区',
      'placeholder': '搜索名称或路径',
      'value': query,
      'onChange': (event: { target: { value: string } }) => setQuery(event.target.value),
    }), e(IconButton, {
      icon: 'close',
      label: '清除工作区搜索',
      className: query ? '' : 'empty',
      disabled: !query,
      onClick: () => {
        setQuery('')
        search.current?.focus()
      },
    })), e('div', { className: 'dsh-space-target-list' }, ...choices.map(item => e('button', { 'type': 'button', 'key': item.workspaceId, 'disabled': disabled, 'onClick': () => choose(item.workspaceId), 'aria-pressed': selectedId === item.workspaceId }, e(Icon, { name: item.kind === 'space' ? 'layers' : 'folder' }), e('span', null, e('span', null, item.title), e('small', { title: item.path }, item.path)), selectedId === item.workspaceId ? e(Icon, { name: 'check', size: 15 }) : null)), error
      ? e('div', { role: 'alert', className: 'dsh-space-target-status' }, '工作区读取失败', e(IconButton, { icon: 'refresh', label: '重试读取工作区', onClick: onRetry }))
      : choices.length === 0 ? e('p', { role: 'status', className: 'dsh-space-target-status' }, items ? needle ? '没有匹配的工作区' : '暂无工作区' : '正在读取工作区…') : null), e('div', { className: 'dsh-space-target-footer' }, independent ? e('button', { 'type': 'button', 'disabled': disabled, 'onClick': () => choose(), 'aria-pressed': !selectedId }, e(Icon, { name: 'chat' }), e('span', null, '独立对话'), !selectedId ? e(Icon, { name: 'check', size: 15 }) : null) : null, onCreate
      ? e('button', {
          type: 'button',
          disabled: disabled || !items,
          onClick: () => {
            close.current()
            onCreate()
          },
        }, e(Icon, { name: 'plus' }), e('span', null, '新建工作区'))
      : null))
  }
}

/** 共用目标候选投影；草稿态只选择意图，真实会话态由宿主处理切换 */
export function createHostWorkspacePicker(React: ReactLike, workspaces: WorkspaceService): (props: HostWorkspacePickerProps) => unknown {
  const e = React.createElement
  const Picker = createTargetPicker(React)
  function OpenPicker(props: HostWorkspacePickerProps): unknown {
    const [registry, setRegistry] = React.useState<RegistryPayload | undefined>(undefined)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [revision, setRevision] = React.useState(0)
    const core = React.useSyncExternalStore(fn => workspaces.list.subscribe(fn), () => workspaces.list.getSnapshot())
    React.useEffect(() => observeRegistry((value, error) => {
      setRegistry(value)
      setError(error)
    }), [revision])
    return e(Picker, {
      anchorRef: props.anchorRef,
      items: registry && core.phase === 'ready' ? projectRegistry(registry, core) : undefined,
      selectedId: props.selectedId,
      independent: props.independent,
      disabled: props.disabled,
      error,
      onClose: props.onClose,
      onPick: (id?: string) => id === undefined ? props.onIndependent?.() : props.onPick(id),
      onRetry: () => setRevision(value => value + 1),
      onCreate: props.onCreate ?? (() => window.dispatchEvent(new Event('dsh-space-create-workspace'))),
    })
  }
  return props => props.open ? e(OpenPicker, { ...props }) : null
}
