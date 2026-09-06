import type { Preparation } from './preparation.ts'
import type { ReactLike, RegistryPayload, WorkspaceService } from './types.ts'
import { createControls } from './controls.ts'
import { memberLabel } from './member-editor.ts'
import { projectRegistry } from './model.ts'
import { observeRegistry } from './registry.ts'
import { createTargetPicker } from './target-picker.ts'

export function createPreparationView(React: ReactLike, preparation: Preparation, workspaces: WorkspaceService): () => unknown {
  const e = React.createElement
  const { Icon, IconButton, Modal } = createControls(React)
  const TargetPicker = createTargetPicker(React)
  return function PreparationView(): unknown {
    const state = React.useSyncExternalStore(preparation.subscribe, preparation.getSnapshot)
    const core = React.useSyncExternalStore(fn => workspaces.list.subscribe(fn), () => workspaces.list.getSnapshot())
    const [registry, setRegistry] = React.useState<RegistryPayload | undefined>(undefined)
    const [registryError, setRegistryError] = React.useState<string | undefined>(undefined)
    const [revision, setRevision] = React.useState(0)
    const [picker, setPicker] = React.useState(false)
    const [confirmation, setConfirmation] = React.useState<'full' | 'discard' | null>(null)
    const [notice, setNotice] = React.useState('')
    const textarea = React.useRef<HTMLTextAreaElement | null>(null)
    const busy = state.phase !== 'editing'
    const loading = !registry || core.phase !== 'ready'
    const items = loading ? [] : projectRegistry(registry, core)
    const target = items.find(item => item.workspaceId === state.targetId)
    const project = target?.kind === 'chat' ? undefined : target
    const missing = !!state.targetId && !loading && !target
    const ready = !loading && !missing
    const retry = (): void => setRevision(value => value + 1)
    React.useEffect(() => observeRegistry((value, error) => {
      setRegistry(value)
      setRegistryError(error)
    }), [revision])
    React.useEffect(() => {
      textarea.current?.focus()
    }, [])
    const select = (id?: string): void => {
      preparation.setTarget(id)
      setPicker(false)
      textarea.current?.focus()
    }
    const send = (): void => {
      if (ready && !busy)
        void preparation.connect(true)
    }
    const attachmentNotice = (): void => setNotice('附件需要在完整输入区添加，当前文本草稿会一并带入。')
    const targetRow = e(
      'div',
      { className: 'dsh-space-preparation-target' },
      e(
        'button',
        {
          'type': 'button',
          'className': 'dsh-space-target-button',
          'aria-label': '选择对话工作区',
          'aria-haspopup': 'dialog',
          'disabled': busy || !!state.workspaceId,
          'onClick': () => setPicker(true),
        },
        e(Icon, { name: project?.kind === 'space' ? 'layers' : project ? 'folder' : 'chat' }),
        e('span', null, project?.title ?? (missing ? '工作区已移除' : loading && state.targetId ? '正在读取工作区…' : '独立对话')),
        e(Icon, { name: 'chevronDown', size: 14 }),
      ),
      state.targetId && !state.workspaceId ? e(IconButton, { icon: 'close', label: '清除工作区选择', disabled: busy, onClick: () => select() }) : null,
    )
    const context = target
      ? e(
          'div',
          { className: 'dsh-space-preparation-context' },
          e('p', { title: target.path }, target.path),
          target.kind === 'space'
            ? e(
                'div',
                { className: 'dsh-space-preparation-members' },
                ...(target.members ?? []).map(member => e(
                  'span',
                  { key: member.path, title: member.path },
                  member.path === target.primary ? e(Icon, { name: 'star', size: 12 }) : null,
                  memberLabel(member),
                )),
              )
            : null,
        )
      : null
    const editor = e('textarea', {
      'ref': textarea,
      'aria-label': '对话草稿',
      'placeholder': '描述你的任务',
      'value': state.draft,
      'disabled': busy,
      'onChange': (event: { target: { value: string } }) => preparation.setDraft(event.target.value),
      'onKeyDown': (event: KeyboardEvent & { nativeEvent: KeyboardEvent }) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault()
          send()
        }
      },
      'onPaste': (event: ClipboardEvent) => {
        if (Array.from(event.clipboardData?.items ?? []).some(item => item.kind === 'file')) {
          event.preventDefault()
          attachmentNotice()
        }
      },
      'onDragOver': (event: DragEvent) => {
        if (event.dataTransfer?.types.includes('Files'))
          event.preventDefault()
      },
      'onDrop': (event: DragEvent) => {
        if (event.dataTransfer?.files.length) {
          event.preventDefault()
          attachmentNotice()
        }
      },
    })
    const tools = e(
      'div',
      { className: 'dsh-space-preparation-tools' },
      e('button', { type: 'button', className: 'dsh-space-full-input', disabled: busy || !ready, onClick: () => setConfirmation('full') }, e(Icon, { name: 'settings' }), '完整输入区'),
      e(
        'span',
        { className: 'dsh-space-preparation-tools-end' },
        e(IconButton, { icon: 'remove', label: '丢弃准备草稿', disabled: busy || (!state.draft && !state.workspaceId), onClick: () => setConfirmation('discard') }),
        e('button', { 'type': 'submit', 'className': 'dsh-space-send', 'title': '发送', 'aria-label': '发送', 'disabled': busy || !ready || !state.draft.trim() }, e(Icon, { name: busy ? 'loading' : 'up' })),
      ),
    )
    const status = busy ? '正在准备工作区…' : registryError ? '工作区信息暂不可用' : loading ? '正在读取工作区…' : missing ? '工作区已移除' : state.workspaceId ? '已确定工作区，目标已锁定，草稿尚未发送' : target ? '尚未创建会话' : '首次发送时创建独立对话目录'
    const confirm = confirmation
      ? e(
          Modal,
          {
            title: confirmation === 'full' ? '进入完整输入区' : '丢弃准备草稿',
            busy: false,
            onClose: () => setConfirmation(null),
            submitLabel: confirmation === 'full' ? '进入输入区' : '丢弃草稿',
            danger: confirmation === 'discard',
            onSubmit: () => {
              if (confirmation === 'full')
                void preparation.connect(false)
              else
                preparation.discard()
              setConfirmation(null)
            },
          },
          confirmation === 'full'
            ? e('p', null, state.targetId ? '将连接所选工作区的真实会话，带入草稿但不发送。附件、模型和权限使用官方输入区。' : '将创建独立对话目录并连接真实会话，带入草稿但不发送。附件、模型和权限使用官方输入区。')
            : e('p', null, state.workspaceId ? '丢弃尚未交接的文本并解除目标锁定。已经创建的目录和会话不会删除。' : '这份未发送文本将被清空，不影响已有会话。'),
        )
      : null
    return e(
      'section',
      { 'className': 'dsh-space-preparation', 'aria-label': '新对话准备', 'aria-busy': busy },
      e('header', { className: 'dsh-space-preparation-header' }, e('span', null, '未发送'), e(IconButton, { icon: 'close', label: '返回原输入区并保留草稿', disabled: busy, onClick: preparation.suspend })),
      e(
        'div',
        { className: 'dsh-space-preparation-body' },
        e('h1', null, project?.kind === 'space' ? '空间新对话' : project ? '工作区新对话' : '新对话'),
        targetRow,
        context,
        e('form', { className: 'dsh-space-preparation-form', onSubmit: (event: Event) => {
          event.preventDefault()
          send()
        } }, editor, tools),
        e('p', { className: 'dsh-space-preparation-status', role: 'status' }, status),
        missing ? e('p', { role: 'alert' }, '所选工作区已移除，请重新选择。') : null,
        state.error ? e('p', { className: 'dsh-space-error', role: 'alert' }, state.error) : null,
        registryError ? e('div', { role: 'alert', className: 'dsh-space-error' }, '工作区描述读取失败，暂不能开始对话。', e('button', { type: 'button', className: 'dsh-space-button', onClick: retry }, '重试')) : null,
        notice ? e('p', { role: 'status' }, notice) : null,
      ),
      picker ? e(TargetPicker, { items: loading ? undefined : items, selectedId: state.targetId, independent: true, error: registryError, onPick: select, onClose: () => setPicker(false), onRetry: retry }) : null,
      confirm,
    )
  }
}
