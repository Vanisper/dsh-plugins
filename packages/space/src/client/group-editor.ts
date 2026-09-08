import type { DisplayGroup, GroupColor } from './layout.ts'
import type { ReactLike } from './types.ts'
import { createControls, tooltipProps } from './controls.ts'
import { GROUP_COLORS } from './layout.ts'

interface Props {
  group: DisplayGroup
  onChange: (group: DisplayGroup) => void
  onSave: (group: DisplayGroup) => void
  onCancel: () => void
}

export function createGroupEditor(React: ReactLike): (props: Props) => unknown {
  const e = React.createElement
  const { IconButton } = createControls(React)
  return function GroupEditor({ group, onChange, onSave, onCancel }: Props): unknown {
    const { title, color } = group
    const [error, setError] = React.useState('')
    const input = React.useRef<HTMLInputElement | null>(null)
    React.useEffect(() => {
      input.current?.focus()
      input.current?.select()
    }, [])
    const save = (): void => {
      try {
        onSave({ ...group, title, color })
      }
      catch (error) {
        setError(error instanceof Error ? error.message : String(error))
      }
    }
    return e('div', {
      'className': 'dsh-space-group-editor',
      'role': 'group',
      'aria-label': '编辑展示分组',
      'onKeyDown': (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.target === input.current) {
          event.preventDefault()
          save()
        }
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      },
    }, e('div', { className: 'dsh-space-inline-rename' }, e('input', {
      'ref': input,
      'aria-label': '分组名称',
      'maxLength': 80,
      'required': true,
      'value': title,
      'onChange': (event: { target: HTMLInputElement }) => onChange({ ...group, title: event.target.value }),
    }), e(IconButton, { icon: 'check', label: '保存分组', disabled: !title.trim(), onClick: save }), e(IconButton, { icon: 'close', label: '取消编辑分组', onClick: onCancel })), e('div', { 'className': 'dsh-space-swatches', 'role': 'radiogroup', 'aria-label': '分组颜色' }, ...Object.entries(GROUP_COLORS).map(([value, label]) => e('label', { key: value, ...tooltipProps(label) }, e('input', {
      'type': 'radio',
      'name': `group-color-${group.id}`,
      'aria-label': label,
      'checked': value === color,
      'onChange': () => onChange({ ...group, color: value as GroupColor }),
    }), e('span', { className: `dsh-space-swatch group-color-${value}` })))), error ? e('div', { className: 'dsh-space-error', role: 'alert' }, error) : null)
  }
}
