import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

interface NameProps { value: string, space: boolean, onChange: (value: string) => void, label?: string }
interface PathProps { value: string, onOpen?: () => void, onPick?: () => void }
interface ToggleProps { value: boolean, onChange: (value: boolean) => void }

/** 创建与编辑共用的字段，不承担工作区身份和保存逻辑 */
export function createWorkspaceFields(React: ReactLike): { Name: (props: NameProps) => unknown, Path: (props: PathProps) => unknown, SpaceToggle: (props: ToggleProps) => unknown } {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  function Name({ value, space, onChange, label = '工作区名称' }: NameProps): unknown {
    return e('label', { className: 'dsh-space-name-field' }, e('span', { className: 'dsh-space-visually-hidden' }, label), e('div', { className: 'dsh-space-workspace-name' }, e(Icon, { name: space ? 'layers' : 'folder' }), e('input', {
      'aria-label': label,
      'placeholder': label,
      value,
      'onChange': (event: { target: HTMLInputElement }) => onChange(event.target.value),
    })))
  }
  function Path({ value, onOpen, onPick }: PathProps): unknown {
    return e('div', { className: 'dsh-space-workspace-path' }, e('span', null, '工作目录'), onPick
      ? e('button', { 'type': 'button', 'className': 'dsh-space-directory-picker', 'aria-label': '选择目录', 'onClick': onPick }, e(Icon, { name: 'folder' }), e('span', null, value || '选择目录'))
      : e('div', { className: 'dsh-space-path-field' }, e('code', null, value), onOpen ? e(IconButton, { icon: 'open', label: '打开工作目录', onClick: onOpen }) : null))
  }
  function SpaceToggle({ value, onChange }: ToggleProps): unknown {
    return e('label', { className: 'dsh-space-check dsh-space-enhance' }, e('input', { 'aria-label': '作为空间', 'type': 'checkbox', 'checked': value, 'onChange': (event: { target: HTMLInputElement }) => onChange(event.target.checked) }), '作为空间')
  }
  return { Name, Path, SpaceToggle }
}
