import type { ReactLike, SidebarPrimitives } from './types.ts'
import { createImeGuard } from './ime.ts'

interface RenameProps {
  title: string
  value: string
  busy: boolean
  error?: string
  disabled: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

/** 复用宿主模态外观，改名提交仍由侧栏持有 */
export function createRenameDialog(React: ReactLike, { Modal, Button }: SidebarPrimitives): (props: RenameProps) => unknown {
  const e = React.createElement
  return function RenameDialog(props: RenameProps): unknown {
    const ime = React.useMemo(createImeGuard, [])
    const previous = React.useRef(document.activeElement as HTMLElement | null)
    const latest = React.useRef(props)
    latest.current = props
    React.useEffect(() => {
      // 在宿主 Escape 监听前拦截组字按键，不关闭输入法候选中的弹窗
      const guard = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && (latest.current.busy || ime.active(event)))
          event.stopImmediatePropagation()
      }
      window.addEventListener('keydown', guard, true)
      return () => {
        window.removeEventListener('keydown', guard, true)
        if (previous.current?.isConnected)
          previous.current.focus()
      }
    }, [])
    const submit = (): void => {
      if (!props.busy && !props.disabled && !ime.active())
        props.onSubmit()
    }
    return e(Modal, {
      open: true,
      title: props.title,
      closeLabel: '关闭',
      onClose: () => {
        if (!props.busy && !ime.active())
          props.onClose()
      },
      footer: [
        e(Button, { key: 'cancel', variant: 'outline', disabled: props.busy, onClick: props.onClose }, '取消'),
        e(Button, { key: 'submit', variant: 'primary', disabled: props.busy || props.disabled, onClick: submit }, props.busy ? '重命名中…' : '重命名'),
      ],
    }, e('input', {
      'className': 'dsh-space-rename-input',
      'aria-label': '名称',
      'autoFocus': true,
      'disabled': props.busy,
      'value': props.value,
      'onFocus': (event: { target: HTMLInputElement }) => event.target.select(),
      'onChange': (event: { target: HTMLInputElement }) => props.onChange(event.target.value),
      'onCompositionStart': ime.start,
      'onCompositionEnd': ime.end,
      'onKeyDown': (event: { key: string, nativeEvent: KeyboardEvent, preventDefault: () => void }) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (!ime.active(event.nativeEvent))
            submit()
        }
      },
    }), props.error ? e('div', { className: 'dsh-space-rename-error', role: 'alert' }, props.error) : null)
  }
}
