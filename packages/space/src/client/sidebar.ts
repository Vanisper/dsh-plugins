import type { SearchRow, SessionView } from './model.ts'
import type { MemberItem, ReactLike, RegistryItem, RegistryPayload, SessionRow, SessionService, SlotProps, WorkspaceService } from './types.ts'
import { fetchRegistry, runOperation } from './api.ts'
import { groupSessions, moveAnchor, projectRegistry, searchRows, sessionMoveAnchor } from './model.ts'
import { waitFor } from './wait.ts'

export const sidebarCss = `.dsh-space-root{box-sizing:border-box;display:flex;min-height:0;flex:1;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:13px}.dsh-space-rail{align-items:center;gap:8px;padding-top:4px}.dsh-space-toolbar{display:flex;height:36px;flex:none;align-items:center;gap:4px;padding:0 4px}.dsh-space-toolbar-title{min-width:0;flex:1;color:var(--dsw-alias-label-tertiary);font-size:12px}.dsh-space-icon{display:inline-flex;width:28px;height:28px;flex:none;align-items:center;justify-content:center;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:17px;line-height:1}.dsh-space-icon:hover,.dsh-space-menu>summary:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-space-icon:disabled{cursor:not-allowed;opacity:.4}.dsh-space-rail .dsh-space-icon{width:36px;height:36px;color:var(--dsw-alias-label-primary);font-size:20px}.dsh-space-search{box-sizing:border-box;width:100%;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:inherit;padding:4px 9px;outline:none}.dsh-space-search:focus{border-color:var(--dsw-alias-state-business-primary)}.dsh-space-list{min-height:0;flex:1;overflow-y:auto;padding:2px 4px 16px}.dsh-space-group{position:relative;margin-top:4px}.dsh-space-head{display:flex;min-height:34px;align-items:center;gap:4px;border-radius:7px;padding:0 4px}.dsh-space-head.current{background:var(--dsw-alias-bg-layer-2)}.dsh-space-toggle{width:20px;height:28px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.dsh-space-heading{min-width:0;flex:1}.dsh-space-title{display:block;overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.dsh-space-meta{display:flex;min-width:0;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:10px}.dsh-space-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-space-kind{flex:none;text-transform:uppercase}.dsh-space-menu{position:relative;flex:none}.dsh-space-menu>summary{display:flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;list-style:none;color:var(--dsw-alias-label-secondary);font-size:18px}.dsh-space-menu>summary::-webkit-details-marker{display:none}.dsh-space-menu-panel{position:absolute;z-index:30;top:28px;right:0;width:154px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px #0002}.dsh-space-menu-panel button{display:block;width:100%;height:30px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;padding:0 9px;cursor:pointer;font-size:12px}.dsh-space-menu-panel button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-space-menu-panel button.danger{color:var(--dsw-alias-state-error-primary)}.dsh-space-session{display:flex;min-height:32px;width:100%;align-items:center;gap:7px;border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;padding:0 4px 0 25px;cursor:pointer}.dsh-space-session:hover,.dsh-space-session.current{background:var(--dsw-alias-bg-layer-2)}.dsh-space-session-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-space-status{width:7px;height:7px;flex:none;border-radius:50%;background:transparent}.dsh-space-status.running{background:var(--dsw-alias-state-business-primary)}.dsh-space-status.pending{background:#d89a32}.dsh-space-status.completed{background:#37a66b}.dsh-space-session-note{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}.dsh-space-member-summary{overflow:hidden;margin:0 8px 3px 25px;color:var(--dsw-alias-label-tertiary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.dsh-space-empty,.dsh-space-notice{padding:8px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}.dsh-space-error{color:var(--dsw-alias-state-error-primary)}.dsh-space-search-row{display:block;width:100%;border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;padding:7px 9px;cursor:pointer}.dsh-space-search-row:hover{background:var(--dsw-alias-bg-layer-2)}.dsh-space-search-context,.dsh-space-snippet{display:block;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.dsh-space-dialog{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;background:#0006;padding:16px}.dsh-space-form{box-sizing:border-box;display:flex;width:min(480px,100%);max-height:min(720px,calc(100vh - 32px));flex-direction:column;gap:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:18px}.dsh-space-form h2{margin:0;font-size:18px;letter-spacing:0}.dsh-space-form label{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-space-form input,.dsh-space-form textarea,.dsh-space-form select{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:inherit;padding:8px;font:inherit}.dsh-space-form textarea{min-height:72px;resize:vertical}.dsh-space-path-field{display:flex;align-items:center;gap:6px}.dsh-space-path-field input{flex:1}.dsh-space-buttons{display:flex;justify-content:flex-end;gap:8px}.dsh-space-button{min-height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:inherit;padding:4px 12px;cursor:pointer}.dsh-space-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-space-button.primary{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1)}.dsh-space-button.danger{color:var(--dsw-alias-state-error-primary)}.dsh-space-button:disabled{cursor:not-allowed;opacity:.45}.dsh-space-member{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l2);padding:8px 0}.dsh-space-member-main{min-width:0;flex:1}.dsh-space-member-main strong,.dsh-space-member-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-space-member-main small{color:var(--dsw-alias-label-tertiary)}.dsh-space-badge{flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 6px;color:var(--dsw-alias-label-tertiary);font-size:10px}`

type Dialog
  = { type: 'create-space' }
    | { type: 'rename-workspace', item: RegistryItem }
    | { type: 'delete-workspace', item: RegistryItem }
    | { type: 'edit-space', workspaceId: string }
    | { type: 'attach-member', workspaceId: string }
    | { type: 'edit-member', workspaceId: string, member: MemberItem }
    | { type: 'rename-session', session: SessionRow }

interface RemoteSearch {
  query: string
  loading: boolean
  items: Array<{ sessionId: string, snippet: string }>
  hasMore: boolean
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function closeDetails(event: { currentTarget: HTMLElement }): void {
  event.currentTarget.closest('details')?.removeAttribute('open')
}

function closeMenus(): void {
  document.querySelectorAll<HTMLDetailsElement>('.dsh-space-menu[open]').forEach(menu => menu.removeAttribute('open'))
}

function statusClass(session: SessionRow): string {
  if (session.pendingInteraction)
    return 'pending'
  if (session.running)
    return 'running'
  if (session.completed)
    return 'completed'
  return ''
}

function kindLabel(kind: RegistryItem['kind']): string {
  if (kind === 'space')
    return '多项目'
  if (kind === 'chat')
    return '对话'
  return '目录'
}

function Modal({ React, title, busy, error, children, onClose, onSubmit, submitLabel = '保存', submitDisabled = false, danger = false }: {
  React: ReactLike
  title: string
  busy: boolean
  error?: string
  children: unknown[]
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  danger?: boolean
}): unknown {
  const e = React.createElement
  return e('div', { className: 'dsh-space-dialog', onMouseDown: () => !busy && onClose() }, e('form', {
    className: 'dsh-space-form',
    onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    onSubmit: (event: { preventDefault: () => void }) => {
      event.preventDefault()
      onSubmit?.()
    },
  }, e('h2', null, title), ...children, error ? e('div', { className: 'dsh-space-notice dsh-space-error', role: 'alert' }, error) : null, e('div', { className: 'dsh-space-buttons' }, e('button', { type: 'button', className: 'dsh-space-button', disabled: busy, onClick: onClose }, '取消'), onSubmit ? e('button', { type: 'submit', className: `dsh-space-button ${danger ? 'danger' : 'primary'}`, disabled: busy || submitDisabled }, busy ? '处理中…' : submitLabel) : null)))
}

export function createSidebar(React: ReactLike, sessions: SessionService, workspaces: WorkspaceService): (props: SlotProps) => unknown {
  const e = React.createElement

  return function Sidebar({ wide = true, expandSidebar }: SlotProps): unknown {
    const [registry, setRegistry] = React.useState<RegistryPayload | undefined>(undefined)
    const [registryRevision, setRegistryRevision] = React.useState(0)
    const [registryError, setRegistryError] = React.useState<string | undefined>(undefined)
    const [dialog, setDialog] = React.useState<Dialog | null>(null)
    const [draft, setDraft] = React.useState<Record<string, string>>({})
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [collapsed, setCollapsed] = React.useState<string[]>([])
    const [query, setQuery] = React.useState('')
    const [remoteSearch, setRemoteSearch] = React.useState<RemoteSearch>({ query: '', loading: false, items: [], hasMore: false })
    const sessionState = React.useSyncExternalStore(fn => sessions.list.subscribe(fn), () => sessions.list.getSnapshot())
    const workspaceState = React.useSyncExternalStore(fn => workspaces.list.subscribe(fn), () => workspaces.list.getSnapshot())
    const items = React.useMemo(() => projectRegistry(registry, workspaceState), [registry, workspaceState])
    const buckets = React.useMemo(() => groupSessions(items, sessionState, workspaceState), [items, sessionState, workspaceState])

    React.useEffect(() => {
      const controller = new AbortController()
      fetchRegistry(controller.signal).then((value) => {
        setRegistry(value)
        setRegistryError(undefined)
      }).catch((cause) => {
        if (!controller.signal.aborted)
          setRegistryError(message(cause))
      })
      return () => controller.abort()
    }, [registryRevision])

    React.useEffect(() => {
      const normalized = query.trim()
      if (!normalized) {
        setRemoteSearch({ query: '', loading: false, items: [], hasMore: false })
        return
      }
      const controller = new AbortController()
      setRemoteSearch({ query: normalized, loading: true, items: [], hasMore: false })
      const timer = window.setTimeout(() => {
        sessions.search(normalized, controller.signal).then((result) => {
          if (controller.signal.aborted)
            return
          if (!result.ok || !result.value)
            throw new Error(result.error?.message ?? '搜索失败')
          setRemoteSearch({ query: normalized, loading: false, ...result.value })
        }).catch(() => {
          if (!controller.signal.aborted)
            setRemoteSearch({ query: normalized, loading: false, items: [], hasMore: false })
        })
      }, 250)
      return () => {
        window.clearTimeout(timer)
        controller.abort()
      }
    }, [query])

    const refreshRegistry = (): void => setRegistryRevision(value => value + 1)
    const begin = (next: Dialog, values: Record<string, string> = {}): void => {
      closeMenus()
      setDraft(values)
      setError(undefined)
      setDialog(next)
    }
    const close = (): void => {
      if (!busy) {
        setDialog(null)
        setError(undefined)
      }
    }
    const perform = (task: () => Promise<void>, after?: () => void): void => {
      if (busy)
        return
      setBusy(true)
      setError(undefined)
      void task().then(() => {
        after?.()
      }).catch(cause => setError(message(cause))).finally(() => setBusy(false))
    }
    const pick = (key: string): void => perform(async () => {
      const path = await workspaces.pickDirectory()
      if (path)
        setDraft(old => ({ ...old, [key]: path }))
    })
    const toggle = (workspaceId: string): void => setCollapsed((old) => {
      if (old.includes(workspaceId))
        return old.filter(id => id !== workspaceId)
      return [...old, workspaceId]
    })

    const createSpace = (): void => perform(async () => {
      const body: Record<string, unknown> = { op: 'create-space', name: draft.name?.trim() }
      if (draft.folder?.trim()) {
        body.folder = draft.folder.trim()
        body.mode = draft.mode || 'reference'
        if (body.mode === 'link' && draft.linkName?.trim())
          body.linkName = draft.linkName.trim()
      }
      const value = await runOperation(body)
      const space = value.space as { workspaceId?: string } | undefined
      if (!space?.workspaceId)
        throw new Error('创建结果缺少核心工作区 ID')
      await waitFor(() => workspaces.list.getSnapshot().items.find(item => item.workspaceId === space.workspaceId), value => value.workspaceId === space.workspaceId)
      workspaces.startSession(space.workspaceId)
      refreshRegistry()
    }, () => setDialog(null))

    const createChat = (): void => perform(async () => {
      const value = await runOperation({ op: 'create-chat' })
      const chat = value.chat as { workspaceId?: string } | undefined
      if (!chat?.workspaceId)
        throw new Error('创建结果缺少核心工作区 ID')
      await waitFor(() => workspaces.list.getSnapshot().items.find(item => item.workspaceId === chat.workspaceId), value => value.workspaceId === chat.workspaceId)
      workspaces.startSession(chat.workspaceId)
      refreshRegistry()
    })

    const createPlainWorkspace = (): void => perform(async () => {
      const path = await workspaces.pickDirectory()
      if (!path)
        return
      const workspace = await workspaces.create({ path })
      workspaces.startSession(workspace.workspaceId)
    })

    const moveWorkspace = (item: RegistryItem, direction: -1 | 1): void => {
      const anchor = moveAnchor(workspaceState.items, item.workspaceId, direction)
      if (anchor === null)
        return
      perform(() => workspaces.insertBefore(item.workspaceId, anchor))
    }

    const moveSession = (item: RegistryItem, session: SessionRow, direction: -1 | 1): void => {
      const workspace = workspaceState.items.find(row => row.workspaceId === item.workspaceId)
      if (!workspace)
        return
      const anchor = sessionMoveAnchor(workspace, session.id, direction)
      if (anchor === null)
        return
      perform(async () => {
        await workspaces.insertSessionBefore(item.workspaceId, session.id, anchor)
      })
    }

    const renderMenu = (item: RegistryItem, session?: SessionRow): unknown => {
      if (session) {
        return e('details', { className: 'dsh-space-menu' }, e('summary', { 'title': '会话操作', 'aria-label': '会话操作', 'onClick': (event: { stopPropagation: () => void }) => event.stopPropagation() }, '⋯'), e('div', { className: 'dsh-space-menu-panel', onClick: (event: { currentTarget: HTMLElement, stopPropagation: () => void }) => {
          event.stopPropagation()
          closeDetails(event)
        } }, e('button', { type: 'button', onClick: () => begin({ type: 'rename-session', session }, { title: session.displayTitle }) }, '重命名'), e('button', { type: 'button', onClick: () => perform(async () => sessions.open(await sessions.fork({ sessionId: session.id, increaseTitle: true }))) }, '分叉会话'), e('button', { type: 'button', onClick: () => moveSession(item, session, -1) }, '上移'), e('button', { type: 'button', onClick: () => moveSession(item, session, 1) }, '下移'), e('button', { type: 'button', className: 'danger', onClick: () => perform(() => workspaces.archiveSession(session.id)) }, '归档')))
      }
      return e('details', { className: 'dsh-space-menu' }, e('summary', { 'title': '工作区操作', 'aria-label': '工作区操作' }, '⋯'), e('div', { className: 'dsh-space-menu-panel', onClick: closeDetails }, e('button', { type: 'button', onClick: () => workspaces.startSession(item.workspaceId) }, '新建会话'), e('button', { type: 'button', onClick: () => perform(() => workspaces.openPath(item.path)) }, '打开目录'), e('button', { type: 'button', onClick: () => begin({ type: 'rename-workspace', item }, { title: item.title }) }, '重命名'), e('button', { type: 'button', onClick: () => moveWorkspace(item, -1) }, '上移'), e('button', { type: 'button', onClick: () => moveWorkspace(item, 1) }, '下移'), item.kind === 'plain'
        ? e('button', { type: 'button', onClick: () => perform(async () => {
            await runOperation({ op: 'enhance-space', workspace: item.workspaceId })
            refreshRegistry()
          }) }, '转为多项目')
        : null, item.kind === 'space' ? e('button', { type: 'button', onClick: () => begin({ type: 'edit-space', workspaceId: item.workspaceId }) }, '编辑成员') : null, item.kind !== 'plain'
        ? e('button', { type: 'button', onClick: () => perform(async () => {
            await runOperation({ op: item.kind === 'space' ? 'drop-space' : 'drop-chat', workspace: item.workspaceId })
            refreshRegistry()
          }) }, '转为普通工作区')
        : null, e('button', { type: 'button', className: 'danger', onClick: () => begin({ type: 'delete-workspace', item }) }, '移除工作区')))
    }

    const renderSession = (item: RegistryItem, session: SessionView): unknown => e('div', { className: `dsh-space-session${sessionState.current === session.id ? ' current' : ''}`, key: session.id, onClick: () => sessions.open(session.id) }, e('span', { className: `dsh-space-status ${statusClass(session)}` }), e('span', { className: 'dsh-space-session-title' }, session.blank ? '新会话' : session.displayTitle), session.runningSubagentCount ? e('span', { className: 'dsh-space-session-note', title: '运行中的子代理' }, `+${session.runningSubagentCount}`) : null, renderMenu(item, session))

    const renderGroup = (item: RegistryItem): unknown => {
      const rows = buckets.rows.get(item.workspaceId) ?? []
      const open = !collapsed.includes(item.workspaceId) || rows.some(row => row.id === sessionState.current)
      const members = item.members ?? []
      return e('section', { className: 'dsh-space-group', key: item.workspaceId }, e('div', { className: `dsh-space-head${rows.some(row => row.id === sessionState.current) ? ' current' : ''}` }, e('button', { 'type': 'button', 'className': 'dsh-space-toggle', 'onClick': () => toggle(item.workspaceId), 'aria-label': open ? '折叠' : '展开' }, open ? '⌄' : '›'), e('div', { className: 'dsh-space-heading' }, e('span', { className: 'dsh-space-title', title: item.title }, item.title), e('span', { className: 'dsh-space-meta' }, e('span', { className: 'dsh-space-kind' }, kindLabel(item.kind)), e('span', { title: item.path }, item.path))), e('button', { 'type': 'button', 'className': 'dsh-space-icon', 'title': '新建会话', 'aria-label': `在 ${item.title} 中新建会话`, 'onClick': () => workspaces.startSession(item.workspaceId) }, '+'), renderMenu(item)), open && item.kind === 'space' && members.length ? e('div', { className: 'dsh-space-member-summary', title: members.map(member => member.path).join('\n') }, `成员：${members.map(member => member.title || member.path.split(/[\\/]/).filter(Boolean).at(-1)).join('、')}`) : null, open ? rows.map(session => renderSession(item, session)) : null)
    }

    const renderDialog = (): unknown => {
      if (!dialog)
        return null
      if (dialog.type === 'create-space') {
        return Modal({ React, title: '创建项目', busy, error, onClose: close, onSubmit: createSpace, submitLabel: '创建项目', submitDisabled: !draft.name?.trim(), children: [
          e('label', { key: 'name' }, '项目名称', e('input', { autoFocus: true, value: draft.name ?? '', placeholder: '项目名称', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, name: event.target.value })) })),
          e('label', { key: 'folder' }, '首个源文件夹（可选）', e('div', { className: 'dsh-space-path-field' }, e('input', { value: draft.folder ?? '', readOnly: true, placeholder: '选择已有目录', title: draft.folder }), e('button', { 'type': 'button', 'className': 'dsh-space-icon', 'title': '选择文件夹', 'aria-label': '选择文件夹', 'onClick': () => pick('folder') }, '▣'))),
          draft.folder ? e('label', { key: 'mode' }, '接入方式', e('select', { value: draft.mode ?? 'reference', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, mode: event.target.value })) }, e('option', { value: 'reference' }, '引用，不修改壳目录'), e('option', { value: 'link' }, '符号链接到 projects 目录'))) : null,
          draft.folder && draft.mode === 'link' ? e('label', { key: 'link' }, '链接名称（可选）', e('input', { value: draft.linkName ?? '', placeholder: '默认使用文件夹名称', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, linkName: event.target.value })) })) : null,
        ] })
      }
      if (dialog.type === 'rename-workspace') {
        return Modal({ React, title: '重命名工作区', busy, error, onClose: close, onSubmit: () => perform(async () => {
          await workspaces.rename(dialog.item.workspaceId, draft.title!.trim())
        }, () => setDialog(null)), submitDisabled: !draft.title?.trim() || draft.title.trim() === dialog.item.title, children: [
          e('label', { key: 'title' }, '名称', e('input', { autoFocus: true, value: draft.title ?? '', onChange: (event: { target: { value: string } }) => setDraft({ title: event.target.value }) })),
        ] })
      }
      if (dialog.type === 'rename-session') {
        return Modal({ React, title: '重命名会话', busy, error, onClose: close, onSubmit: () => perform(async () => {
          const binding = sessions.binding(dialog.session.id)
          if (!binding)
            throw new Error(`找不到会话：${dialog.session.id}`)
          const result = await binding.session.rename(draft.title!.trim())
          if (!result.ok)
            throw new Error(result.error?.message ?? '重命名失败')
        }, () => setDialog(null)), submitDisabled: !draft.title?.trim() || draft.title.trim() === dialog.session.displayTitle, children: [
          e('label', { key: 'title' }, '名称', e('input', { autoFocus: true, value: draft.title ?? '', onChange: (event: { target: { value: string } }) => setDraft({ title: event.target.value }) })),
        ] })
      }
      if (dialog.type === 'delete-workspace') {
        return Modal({ React, title: '移除工作区', busy, error, onClose: close, onSubmit: () => perform(async () => {
          if (dialog.item.kind !== 'plain') {
            await runOperation({ op: dialog.item.kind === 'space' ? 'drop-space' : 'drop-chat', workspace: dialog.item.workspaceId })
            refreshRegistry()
          }
          await workspaces.delete(dialog.item.workspaceId)
        }, () => setDialog(null)), submitLabel: '移除', danger: true, children: [
          e('div', { key: 'copy', className: 'dsh-space-notice' }, `只从核心工作区列表移除“${dialog.item.title}”。目录与会话日志都会保留。`),
        ] })
      }
      const current = items.find(item => item.workspaceId === dialog.workspaceId)
      if (!current || current.kind !== 'space')
        return null
      if (dialog.type === 'edit-space') {
        const members = current.members ?? []
        return Modal({ React, title: '编辑项目', busy, error, onClose: close, children: [
          e('div', { key: 'path', className: 'dsh-space-notice' }, current.path),
          ...members.map(member => e('div', { className: 'dsh-space-member', key: member.path }, e('div', { className: 'dsh-space-member-main' }, e('strong', null, member.title || member.path.split(/[\\/]/).filter(Boolean).at(-1)), e('small', { title: member.path }, member.path)), current.primary === member.path
            ? e('span', { className: 'dsh-space-badge' }, '主要')
            : e('button', { type: 'button', className: 'dsh-space-button', onClick: () => perform(async () => {
                await runOperation({ op: 'primary', workspace: current.workspaceId, target: member.path })
                refreshRegistry()
              }) }, '设为主要'), e('button', { 'type': 'button', 'className': 'dsh-space-icon', 'title': '编辑成员', 'aria-label': '编辑成员', 'onClick': () => begin({ type: 'edit-member', workspaceId: current.workspaceId, member }, { title: member.title ?? '', description: member.description ?? '' }) }, '✎'), e('button', { 'type': 'button', 'className': 'dsh-space-icon', 'title': '移除成员', 'aria-label': '移除成员', 'onClick': () => perform(async () => {
            await runOperation({ op: 'detach', workspace: current.workspaceId, target: member.path })
            refreshRegistry()
          }) }, '×'))),
          e('button', { key: 'attach', type: 'button', className: 'dsh-space-button', onClick: () => begin({ type: 'attach-member', workspaceId: current.workspaceId }, { mode: 'reference' }) }, '添加文件夹'),
        ] })
      }
      if (dialog.type === 'attach-member') {
        return Modal({ React, title: '添加文件夹', busy, error, onClose: close, onSubmit: () => perform(async () => {
          await runOperation({ op: 'attach', workspace: current.workspaceId, target: draft.folder!.trim(), mode: draft.mode || 'reference', ...(draft.mode === 'link' && draft.linkName?.trim() ? { linkName: draft.linkName.trim() } : {}) })
          refreshRegistry()
        }, () => setDialog({ type: 'edit-space', workspaceId: current.workspaceId })), submitLabel: '添加', submitDisabled: !draft.folder?.trim(), children: [
          e('label', { key: 'folder' }, '源文件夹', e('div', { className: 'dsh-space-path-field' }, e('input', { value: draft.folder ?? '', readOnly: true, placeholder: '选择已有目录', title: draft.folder }), e('button', { 'type': 'button', 'className': 'dsh-space-icon', 'title': '选择文件夹', 'aria-label': '选择文件夹', 'onClick': () => pick('folder') }, '▣'))),
          e('label', { key: 'mode' }, '接入方式', e('select', { value: draft.mode ?? 'reference', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, mode: event.target.value })) }, e('option', { value: 'reference' }, '引用'), e('option', { value: 'link' }, '符号链接'))),
          draft.mode === 'link' ? e('label', { key: 'link' }, '链接名称（可选）', e('input', { value: draft.linkName ?? '', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, linkName: event.target.value })) })) : null,
        ] })
      }
      return Modal({ React, title: '编辑成员', busy, error, onClose: close, onSubmit: () => perform(async () => {
        await runOperation({ op: 'update-member', workspace: current.workspaceId, target: dialog.member.path, title: draft.title ?? '', description: draft.description ?? '' })
        refreshRegistry()
      }, () => setDialog({ type: 'edit-space', workspaceId: current.workspaceId })), children: [
        e('label', { key: 'title' }, '显示名称', e('input', { value: draft.title ?? '', placeholder: dialog.member.path.split(/[\\/]/).filter(Boolean).at(-1), onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, title: event.target.value })) })),
        e('label', { key: 'description' }, '说明', e('textarea', { value: draft.description ?? '', onChange: (event: { target: { value: string } }) => setDraft(old => ({ ...old, description: event.target.value })) })),
      ] })
    }

    if (!wide) {
      const openCreateSpace = (): void => {
        expandSidebar?.()
        begin({ type: 'create-space' }, { mode: 'reference' })
      }
      return e('div', { className: 'dsh-space-root dsh-space-rail' }, e('button', { 'className': 'dsh-space-icon', 'title': '搜索会话', 'aria-label': '搜索会话', 'onClick': expandSidebar }, '⌕'), e('button', { 'className': 'dsh-space-icon', 'title': '创建项目', 'aria-label': '创建项目', 'onClick': openCreateSpace }, '+'), e('button', { 'className': 'dsh-space-icon', 'title': '新建对话', 'aria-label': '新建对话', 'disabled': busy, 'onClick': createChat }, '◌'))
    }

    const normalizedQuery = query.trim()
    const search = searchRows(normalizedQuery, items, sessionState, workspaceState.archivedSessionIds, remoteSearch.query === normalizedQuery ? remoteSearch : { items: [], hasMore: false }, sessions.searchResultLimit)
    const miscGroup = workspaceState.phase === 'ready' && buckets.misc.length
      ? e('section', { className: 'dsh-space-group', key: 'misc' }, e('div', { className: 'dsh-space-head' }, e('div', { className: 'dsh-space-heading' }, e('span', { className: 'dsh-space-title' }, '未归组')),
        ), ...buckets.misc.map(session => e('button', {
          type: 'button',
          className: `dsh-space-session${sessionState.current === session.id ? ' current' : ''}`,
          key: session.id,
          onClick: () => sessions.open(session.id),
        }, e('span', { className: `dsh-space-status ${statusClass(session)}` }), e('span', { className: 'dsh-space-session-title' }, session.displayTitle))))
      : null
    const content = normalizedQuery
      ? [
          ...search.items.map((row: SearchRow) => e('button', { type: 'button', className: 'dsh-space-search-row', key: row.id, onClick: () => sessions.open(row.id) }, e('strong', null, row.displayTitle), e('span', { className: 'dsh-space-search-context' }, row.workspaceTitle), row.snippet ? e('span', { className: 'dsh-space-snippet' }, row.snippet) : null)),
          remoteSearch.loading ? e('div', { className: 'dsh-space-empty', key: 'loading' }, '搜索中…') : null,
          search.hasMore ? e('div', { className: 'dsh-space-empty', key: 'more' }, '结果较多，请缩小范围') : null,
          !remoteSearch.loading && search.items.length === 0 ? e('div', { className: 'dsh-space-empty', key: 'none' }, '没有匹配会话') : null,
        ]
      : [
          ...items.map(renderGroup),
          miscGroup,
          workspaceState.phase === 'pending' || sessionState.phase === 'pending' ? e('div', { className: 'dsh-space-empty', key: 'loading' }, '加载工作区…') : null,
          workspaceState.phase === 'ready' && items.length === 0 ? e('div', { className: 'dsh-space-empty', key: 'none' }, '暂无工作区') : null,
        ]

    return e('div', { className: 'dsh-space-root' }, renderDialog(), e('div', { className: 'dsh-space-toolbar' }, e('span', { className: 'dsh-space-toolbar-title' }, '工作区'), e('button', { 'className': 'dsh-space-icon', 'title': '添加普通工作区', 'aria-label': '添加普通工作区', 'disabled': busy, 'onClick': createPlainWorkspace }, '▣'), e('button', { 'className': 'dsh-space-icon', 'title': '创建多项目工作区', 'aria-label': '创建多项目工作区', 'disabled': busy, 'onClick': () => begin({ type: 'create-space' }, { mode: 'reference' }) }, '+'), e('button', { 'className': 'dsh-space-icon', 'title': '新建对话', 'aria-label': '新建对话', 'disabled': busy, 'onClick': createChat }, '◌')), e('div', { className: 'dsh-space-toolbar' }, e('input', { 'className': 'dsh-space-search', 'type': 'search', 'value': query, 'placeholder': '搜索会话', 'aria-label': '搜索会话', 'onChange': (event: { target: { value: string } }) => setQuery(event.target.value) })), registryError ? e('div', { className: 'dsh-space-notice dsh-space-error' }, `附加描述不可用，当前按普通工作区显示：${registryError}`) : null, workspaceState.state === 'error' ? e('div', { className: 'dsh-space-notice dsh-space-error' }, workspaceState.error?.message ?? '核心工作区加载失败') : null, registry && registry.invalidSpaces.length + registry.invalidChats.length > 0 ? e('div', { className: 'dsh-space-notice dsh-space-error' }, `有 ${registry.invalidSpaces.length + registry.invalidChats.length} 条附加描述找不到核心工作区`) : null, error && !dialog ? e('div', { className: 'dsh-space-notice dsh-space-error' }, error) : null, e('div', { className: 'dsh-space-list' }, ...content))
  }
}
