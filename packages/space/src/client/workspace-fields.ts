import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

interface NameProps { value: string, space: boolean, onChange: (value: string) => void, label?: string }
export interface WorkingDirectory { path: string, pending?: boolean, onOpen?: () => void, onPick?: () => void }
interface ToggleProps { value: boolean, disabled?: boolean, onChange: (value: boolean) => void }

/** 创建与编辑共用的字段，不承担工作区身份和保存逻辑 */
export function createWorkspaceFields(React: ReactLike): { Name: (props: NameProps) => unknown, Directory: (props: WorkingDirectory) => unknown, TypeSwitch: (props: ToggleProps) => unknown } {
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
  function Directory({ path, pending, onOpen, onPick }: WorkingDirectory): unknown {
    if (onPick) {
      return e('button', { 'type': 'button', 'className': `dsh-space-directory-picker${path ? '' : ' empty'}`, 'aria-label': '选择目录', 'onClick': onPick }, e(Icon, { name: path ? 'folder' : 'folderPlus' }), path ? e('span', { className: 'dsh-space-member-main' }, e('span', { className: 'dsh-space-directory-title' }, path.split(/[\\/]/).filter(Boolean).at(-1) || path, e('small', { className: 'dsh-space-directory-role' }, '工作目录')), e('small', { title: path }, path)) : '选择文件夹')
    }
    return e('div', { 'className': `dsh-space-working-directory${pending ? ' pending' : ''}`, 'aria-label': '工作目录' }, e(Icon, { name: pending ? 'folderPlus' : 'folder' }), e('div', { className: 'dsh-space-member-main' }, e('span', { className: 'dsh-space-directory-title' }, pending ? '工作目录' : path.split(/[\\/]/).filter(Boolean).at(-1) || path, e('small', { className: 'dsh-space-directory-role' }, pending ? '新建' : '工作目录')), path ? e('small', { title: path }, path) : null), onOpen ? e(IconButton, { icon: 'open', label: '打开工作目录', onClick: onOpen }) : null)
  }
  function TypeSwitch({ value, disabled, onChange }: ToggleProps): unknown {
    return e('div', { 'className': 'dsh-space-type-switch', 'role': 'radiogroup', 'aria-label': '工作区类型' }, ...([true, false] as const).map(space => e('button', {
      'key': String(space),
      'type': 'button',
      'role': 'radio',
      'aria-checked': value === space,
      disabled,
      'tabIndex': value === space ? 0 : -1,
      'onClick': () => onChange(space),
      'onKeyDown': (event: KeyboardEvent) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? true : event.key === 'End' ? false : !space
          onChange(next)
          const target = event.currentTarget as HTMLElement
          target.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next ? 0 : 1]?.focus()
        }
      },
    }, e(Icon, { name: space ? 'layers' : 'folder', size: 14 }), space ? '空间' : '目录')))
  }
  return { Name, Directory, TypeSwitch }
}
