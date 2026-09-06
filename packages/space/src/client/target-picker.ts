import type { ReactLike, RegistryItem, RegistryPayload, WorkspaceService } from './types.ts'
import { createControls } from './controls.ts'
import { projectRegistry } from './model.ts'
import { observeRegistry } from './registry.ts'

interface TargetPickerProps {
  items?: RegistryItem[]
  selectedId?: string
  independent?: boolean
  error?: string
  onPick: (id?: string) => void
  onClose: () => void
  onRetry: () => void
}

export interface HostWorkspacePickerProps {
  open: boolean
  selectedId?: string
  onPick: (id: string) => void
  onClose: () => void
}

export function createTargetPicker(React: ReactLike): (props: TargetPickerProps) => unknown {
  const e = React.createElement
  const { Icon, Modal } = createControls(React)
  return function TargetPicker({ items, selectedId, independent, error, onPick, onClose, onRetry }: TargetPickerProps): unknown {
    const [query, setQuery] = React.useState('')
    const needle = query.trim().toLocaleLowerCase()
    const choices = (items ?? []).filter(item => item.kind !== 'chat' && `${item.title}\n${item.path}`.toLocaleLowerCase().includes(needle))
    return e(Modal, { title: '选择工作区', busy: false, onClose }, e('input', {
      'className': 'dsh-space-input',
      'aria-label': '搜索工作区',
      'placeholder': '搜索名称或路径',
      'value': query,
      'onChange': (event: { target: { value: string } }) => setQuery(event.target.value),
    }), e('div', { className: 'dsh-space-target-list' }, independent ? e('button', { 'type': 'button', 'onClick': () => onPick(), 'aria-pressed': !selectedId }, e(Icon, { name: 'chat' }), e('span', null, '独立对话'), !selectedId ? e(Icon, { name: 'check' }) : null) : null, ...choices.map(item => e('button', { 'type': 'button', 'key': item.workspaceId, 'onClick': () => onPick(item.workspaceId), 'aria-pressed': selectedId === item.workspaceId }, e(Icon, { name: item.kind === 'space' ? 'layers' : 'folder' }), e('span', null, item.title, e('small', null, item.path)), selectedId === item.workspaceId ? e(Icon, { name: 'check' }) : null)), error
      ? e('div', { role: 'alert' }, '工作区描述读取失败。', e('button', { type: 'button', className: 'dsh-space-button', onClick: onRetry }, '重试'))
      : choices.length === 0 ? e('p', { role: 'status' }, items ? '没有匹配的工作区' : '正在读取工作区…') : null))
  }
}

/** 完整输入区沿用宿主的草稿转移，仅替换候选投影，不列出 Chat 目录 */
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
      items: registry && core.phase === 'ready' ? projectRegistry(registry, core) : undefined,
      selectedId: props.selectedId,
      error,
      onClose: props.onClose,
      onPick: (id: string) => props.onPick(id),
      onRetry: () => setRevision(value => value + 1),
    })
  }
  return props => props.open ? e(OpenPicker, { ...props }) : null
}
