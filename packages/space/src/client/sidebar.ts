import type { MenuAction } from './controls.ts'
import type { MemberDraft } from './member-editor.ts'
import type { ModeStore } from './mode.ts'
import type { SessionView } from './model.ts'
import type {
  ReactLike,
  RegistryItem,
  RegistryPayload,
  SessionRow,
  SessionService,
  SlotProps,
  WorkspaceService,
} from './types.ts'
import { fetchRegistry, runOperation } from './api.ts'
import { createControls } from './controls.ts'
import { createMemberEditor, memberLabel } from './member-editor.ts'
import {
  groupSessions,
  moveAnchor,
  projectRegistry,
  searchRows,
  sessionMoveAnchor,
} from './model.ts'
import { observeRegistry } from './registry.ts'
import { waitFor } from './wait.ts'

type Dialog
  = | { type: 'create-space' }
    | { type: 'add-directory' }
    | { type: 'invalid' }
    | { type: 'drop-invalid', kind: 'space' | 'chat', workspaceId: string }
    | { type: 'rename-workspace', item: RegistryItem }
    | { type: 'delete-workspace', item: RegistryItem }
    | { type: 'drop-description', item: RegistryItem }
    | { type: 'edit-space', item: RegistryItem }
    | { type: 'rename-session', session: SessionRow }

interface RemoteSearch {
  query: string
  loading: boolean
  items: Array<{ sessionId: string, snippet: string }>
  hasMore: boolean
  error?: string
}

const COLLAPSED_KEY = 'dsh-space.sidebar.collapsed'
function readCollapsed(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(COLLAPSED_KEY) ?? '[]',
    )
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : []
  }
  catch {
    return []
  }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function kindLabel(kind: RegistryItem['kind']): string {
  return kind === 'space' ? '空间' : kind === 'chat' ? '独立对话' : '目录'
}
function sessionStatus(session: SessionRow): {
  className: string
  label: string
} {
  return session.pendingInteraction
    ? { className: 'pending', label: '等待交互' }
    : session.running
      ? { className: 'running', label: '运行中' }
      : session.completed
        ? { className: 'completed', label: '完成未读' }
        : { className: '', label: '空闲' }
}

export function createSidebar(
  React: ReactLike,
  sessions: SessionService,
  workspaces: WorkspaceService,
  mode: ModeStore,
): (props: SlotProps) => unknown {
  const e = React.createElement
  const { Icon, IconButton, Menu, Modal } = createControls(React)
  const MemberEditor = createMemberEditor(React)
  const subscribeSessions = (fn: () => void): (() => void) =>
    sessions.list.subscribe(fn)
  const readSessions = (): ReturnType<typeof sessions.list.getSnapshot> =>
    sessions.list.getSnapshot()
  const subscribeWorkspaces = (fn: () => void): (() => void) =>
    workspaces.list.subscribe(fn)
  const readWorkspaces = (): ReturnType<typeof workspaces.list.getSnapshot> =>
    workspaces.list.getSnapshot()

  return function Sidebar({ wide = true, expandSidebar }: SlotProps): unknown {
    const [registry, setRegistry] = React.useState<RegistryPayload | undefined>(
      undefined,
    )
    const [registryRevision, setRegistryRevision] = React.useState(0)
    const [registryError, setRegistryError] = React.useState<
      string | undefined
    >(undefined)
    const [dialog, setDialog] = React.useState<Dialog | null>(null)
    const [text, setText] = React.useState('')
    const [members, setMembers] = React.useState<MemberDraft>({ members: [] })
    const [busy, setBusy] = React.useState(false)
    const busyRef = React.useRef(false)
    const createdId = React.useRef<string | undefined>(undefined)
    const chatId = React.useRef<string | undefined>(undefined)
    const descriptionRemoved = React.useRef<string | undefined>(undefined)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [notice, setNotice] = React.useState('')
    const [collapsed, setCollapsed] = React.useState(readCollapsed)
    const [query, setQuery] = React.useState('')
    const [searchRevision, setSearchRevision] = React.useState(0)
    const [remoteSearch, setRemoteSearch] = React.useState<RemoteSearch>({
      query: '',
      loading: false,
      items: [],
      hasMore: false,
    })
    const searchInput = React.useRef<HTMLInputElement | null>(null)
    const focusSearch = React.useRef(false)
    const dragWorkspace = React.useRef<string | undefined>(undefined)
    const sessionState = React.useSyncExternalStore(
      subscribeSessions,
      readSessions,
    )
    const workspaceState = React.useSyncExternalStore(
      subscribeWorkspaces,
      readWorkspaces,
    )
    const items = React.useMemo(
      () => projectRegistry(registry, workspaceState),
      [registry, workspaceState],
    )
    const buckets = React.useMemo(
      () => groupSessions(items, sessionState, workspaceState),
      [items, sessionState, workspaceState],
    )

    React.useEffect(
      () =>
        observeRegistry((value, error) => {
          setRegistry(value)
          setRegistryError(error)
        }),
      [registryRevision],
    )
    React.useEffect(() => {
      mode.setBlocked(!!dialog || busy)
    }, [dialog, busy])
    React.useEffect(() => () => mode.setBlocked(false), [])
    React.useEffect(() => {
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
      }
      catch {
        /* 折叠状态仍在当前页面生效 */
      }
    }, [collapsed])
    React.useEffect(() => {
      const owner = workspaceState.items.find(item =>
        item.sessionIds.includes(sessionState.current ?? ''),
      )
      if (owner)
        setCollapsed(old => old.filter(id => id !== owner.workspaceId))
    }, [sessionState.current])
    React.useEffect(() => {
      if (wide && focusSearch.current) {
        searchInput.current?.focus()
        focusSearch.current = false
      }
    }, [wide])
    React.useEffect(() => {
      if (!notice)
        return
      const timer = setTimeout(() => setNotice(''), 4500)
      return () => clearTimeout(timer)
    }, [notice])
    React.useEffect(() => {
      const normalized = query.trim()
      if (!normalized) {
        setRemoteSearch({
          query: '',
          loading: false,
          items: [],
          hasMore: false,
        })
        return
      }
      const controller = new AbortController()
      setRemoteSearch({
        query: normalized,
        loading: true,
        items: [],
        hasMore: false,
      })
      const timer = setTimeout(() => {
        void sessions
          .search(normalized, controller.signal)
          .then((result) => {
            if (controller.signal.aborted)
              return
            if (!result.ok || !result.value)
              throw new Error(result.error?.message ?? '全文搜索失败')
            setRemoteSearch({
              query: normalized,
              loading: false,
              ...result.value,
            })
          })
          .catch((error) => {
            if (!controller.signal.aborted) {
              setRemoteSearch({
                query: normalized,
                loading: false,
                items: [],
                hasMore: false,
                error: message(error),
              })
            }
          })
      }, 250)
      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    }, [query, searchRevision])

    const refresh = (): void => setRegistryRevision(value => value + 1)
    const begin = (next: Dialog): void => {
      if (busyRef.current)
        return
      createdId.current = undefined
      descriptionRemoved.current = undefined
      setError(undefined)
      setText(
        next.type === 'rename-workspace'
          ? next.item.title
          : next.type === 'rename-session'
            ? next.session.displayTitle
            : '',
      )
      setMembers(
        next.type === 'edit-space'
          ? {
              members: structuredClone(next.item.members ?? []),
              primary: next.item.primary,
            }
          : { members: [] },
      )
      mode.setBlocked(true)
      setDialog(next)
    }
    const close = (): void => {
      if (!busyRef.current) {
        setDialog(null)
        setError(undefined)
      }
    }
    const perform = (task: () => Promise<void>, after?: () => void): void => {
      if (busyRef.current)
        return
      busyRef.current = true
      mode.setBlocked(true)
      setBusy(true)
      setError(undefined)
      void Promise.resolve().then(task).then(() => after?.()).catch(cause => setError(message(cause))).finally(() => {
        busyRef.current = false
        setBusy(false)
      })
    }
    const startCreated = async (id: string): Promise<void> => {
      refresh()
      try {
        await waitFor(
          () => readWorkspaces().items.find(item => item.workspaceId === id),
          item => item.workspaceId === id,
        )
      }
      catch {
        throw new Error(
          '工作区已创建，正在等待核心列表同步。请重试进入，不会重复创建。',
        )
      }
      workspaces.startSession(id)
    }
    const createSpace = (): void =>
      perform(
        async () => {
          if (!createdId.current) {
            const result = await runOperation({
              op: 'create-space',
              name: text.trim(),
              ...members,
            })
            createdId.current = (
              result.space as { workspaceId?: string }
            )?.workspaceId
            if (!createdId.current)
              throw new Error('创建结果缺少核心工作区 ID')
          }
          await startCreated(createdId.current)
        },
        () => {
          setDialog(null)
          setNotice('空间已创建')
        },
      )
    const createChat = (): void =>
      perform(async () => {
        if (!chatId.current) {
          const result = await runOperation({ op: 'create-chat' })
          chatId.current = (
            result.chat as { workspaceId?: string }
          )?.workspaceId
          if (!chatId.current)
            throw new Error('创建结果缺少核心工作区 ID')
        }
        await startCreated(chatId.current)
        chatId.current = undefined
      })
    const toggle = (id: string): void =>
      setCollapsed(old =>
        old.includes(id) ? old.filter(value => value !== id) : [...old, id],
      )
    const runOp = (body: Record<string, unknown>, success: string): void =>
      perform(async () => {
        await runOperation(body)
        refresh()
        setNotice(success)
      })
    const sessionActions = (
      session: SessionRow,
      item?: RegistryItem,
    ): MenuAction[] => {
      const core = workspaceState.items.find(
        row => row.workspaceId === item?.workspaceId,
      )
      return [
        {
          label: '重命名',
          icon: 'edit',
          run: () => begin({ type: 'rename-session', session }),
        },
        {
          label: '分叉会话',
          icon: 'fork',
          disabled: session.blank,
          run: () =>
            perform(async () =>
              sessions.open(
                await sessions.fork({
                  sessionId: session.id,
                  increaseTitle: true,
                }),
              ),
            ),
        },
        ...([-1, 1] as const).map(direction => ({
          label: direction === -1 ? '上移' : '下移',
          icon: direction === -1 ? ('up' as const) : ('down' as const),
          disabled:
            !core || sessionMoveAnchor(core, session.id, direction) === null,
          run: () =>
            perform(async () => {
              if (core) {
                const anchor = sessionMoveAnchor(core, session.id, direction)
                if (anchor !== null) {
                  await workspaces.insertSessionBefore(
                    core.workspaceId,
                    session.id,
                    anchor,
                  )
                }
              }
            }),
        })),
        {
          label: '归档会话',
          icon: 'archive',
          run: () =>
            perform(async () => {
              await workspaces.archiveSession(session.id)
              setNotice('会话已归档')
            }),
        },
      ]
    }
    const workspaceActions = (item: RegistryItem): MenuAction[] => [
      {
        label: '新建会话',
        icon: 'chat',
        run: () => workspaces.startSession(item.workspaceId),
      },
      {
        label: '打开目录',
        icon: 'open',
        run: () => perform(() => workspaces.openPath(item.path)),
      },
      {
        label: '重命名',
        icon: 'edit',
        run: () => begin({ type: 'rename-workspace', item }),
      },
      ...([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移' : '下移',
        icon: direction === -1 ? ('up' as const) : ('down' as const),
        disabled:
          moveAnchor(workspaceState.items, item.workspaceId, direction)
          === null,
        run: () => {
          const anchor = moveAnchor(
            workspaceState.items,
            item.workspaceId,
            direction,
          )
          if (anchor !== null)
            perform(() => workspaces.insertBefore(item.workspaceId, anchor))
        },
      })),
      ...(item.kind === 'plain'
        ? [
            {
              label: '增强为空间',
              icon: 'layers' as const,
              disabled: !registry,
              run: () =>
                runOp(
                  { op: 'enhance-space', workspace: item.workspaceId },
                  '已增强为空间',
                ),
            },
          ]
        : []),
      ...(item.kind === 'space'
        ? [
            {
              label: '编辑成员',
              icon: 'settings' as const,
              run: () => begin({ type: 'edit-space', item }),
            },
          ]
        : []),
      ...(item.kind !== 'plain'
        ? [
            {
              label: '移除附加描述',
              icon: 'folder' as const,
              run: () => begin({ type: 'drop-description', item }),
            },
          ]
        : []),
      {
        label: '移除工作区',
        icon: 'remove',
        danger: true,
        disabled: !registry,
        run: () => begin({ type: 'delete-workspace', item }),
      },
    ]
    const openContextMenu = (event: {
      preventDefault: () => void
      currentTarget: HTMLElement
    }): void => {
      event.preventDefault()
      event.currentTarget
        .querySelector<HTMLButtonElement>('.dsh-space-menu-trigger')
        ?.click()
    }
    const renderSession = (
      session: SessionView,
      item?: RegistryItem,
    ): unknown => {
      const status = sessionStatus(session)
      return e(
        'div',
        {
          className: `dsh-space-session${sessionState.current === session.id ? ' current' : ''}`,
          key: session.id,
          onContextMenu: openContextMenu,
        },
        e(
          'button',
          {
            'type': 'button',
            'className': 'dsh-space-session-main',
            'aria-current':
              sessionState.current === session.id ? 'page' : undefined,
            'title': `${session.displayTitle} · ${status.label}`,
            'onClick': () => sessions.open(session.id),
          },
          e('span', {
            'className': `dsh-space-status ${status.className}`,
            'role': 'img',
            'aria-label': status.label,
          }),
          e(
            'span',
            { className: 'dsh-space-session-title' },
            session.displayTitle || '新会话',
          ),
          session.runningSubagentCount
            ? e(
                'span',
                { className: 'dsh-space-count', title: '运行中的子代理' },
                `+${session.runningSubagentCount}`,
              )
            : null,
        ),
        e(Menu, {
          label: `${session.displayTitle} 会话操作`,
          disabled: busy,
          actions: sessionActions(session, item),
        }),
      )
    }
    const renderGroup = (item: RegistryItem): unknown => {
      const rows = buckets.rows.get(item.workspaceId) ?? []
      const open = !collapsed.includes(item.workspaceId)
      const primary = item.members?.find(
        member => member.path === item.primary,
      )
      return e(
        'section',
        {
          className: 'dsh-space-group',
          key: item.workspaceId,
          onDragOver: (event: DragEvent) => {
            if (dragWorkspace.current)
              event.preventDefault()
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault()
            const from = dragWorkspace.current
            dragWorkspace.current = undefined
            if (from && from !== item.workspaceId)
              perform(() => workspaces.insertBefore(from, item.workspaceId))
          },
        },
        e(
          'div',
          { className: 'dsh-space-head', onContextMenu: openContextMenu },
          e(
            'button',
            {
              'type': 'button',
              'className': 'dsh-space-heading',
              'aria-expanded': open,
              'title': `${item.title}\n${item.path}`,
              'draggable': !busy,
              'onDragStart': (event: DragEvent) => {
                dragWorkspace.current = item.workspaceId
                event.dataTransfer?.setData('text/plain', item.workspaceId)
              },
              'onDragEnd': () => {
                dragWorkspace.current = undefined
              },
              'onClick': () => toggle(item.workspaceId),
            },
            e(Icon, { name: open ? 'chevronDown' : 'chevronRight', size: 12 }),
            e(Icon, {
              name:
                item.kind === 'space'
                  ? 'layers'
                  : item.kind === 'chat'
                    ? 'chat'
                    : 'folder',
            }),
            e(
              'span',
              { className: 'dsh-space-heading-text' },
              e('span', { className: 'dsh-space-title' }, item.title),
              e(
                'span',
                { className: 'dsh-space-meta' },
                `${kindLabel(item.kind)} · ${item.path}`,
              ),
            ),
            e('span', { className: 'dsh-space-count' }, rows.length || ''),
          ),
          e(IconButton, {
            icon: 'chat',
            label: `在 ${item.title} 中新建会话`,
            disabled: busy,
            onClick: () => workspaces.startSession(item.workspaceId),
          }),
          e(Menu, {
            label: `${item.title} 工作区操作`,
            disabled: busy,
            actions: workspaceActions(item),
          }),
        ),
        open && item.kind === 'space'
          ? e(
              'button',
              {
                type: 'button',
                className: 'dsh-space-member-summary',
                title: item.members?.map(member => member.path).join('\n'),
                disabled: busy,
                onClick: () => begin({ type: 'edit-space', item }),
              },
              item.members?.length
                ? `${item.members.length} 个成员${primary ? ` · 主要 ${memberLabel(primary)}` : ''}`
                : '添加成员目录',
            )
          : null,
        open ? rows.map(session => renderSession(session, item)) : null,
      )
    }
    const renderDialog = (): unknown => {
      if (!dialog)
        return null
      const props = { busy, error, onClose: close }
      const onPick = (accept: (path: string) => void): void => perform(async () => {
        const path = await workspaces.pickDirectory()
        if (path)
          accept(path)
      })
      const input = (label: string): unknown =>
        e(
          'label',
          null,
          label,
          e('input', {
            autoFocus: true,
            value: text,
            required: true,
            onChange: (event: { target: HTMLInputElement }) =>
              setText(event.target.value),
          }),
        )
      if (dialog.type === 'create-space') {
        return e(
          Modal,
          {
            ...props,
            title: createdId.current ? '空间已创建' : '创建空间',
            onSubmit: createSpace,
            submitDisabled: !createdId.current && !text.trim(),
            fieldsDisabled: !!createdId.current,
            cancelLabel: createdId.current ? '关闭' : '取消',
            submitLabel: createdId.current ? '进入工作区' : '创建空间',
          },
          input('空间名称'),
          e(MemberEditor, { draft: members, setDraft: setMembers, onPick }),
          e(
            'small',
            { className: 'dsh-space-muted' },
            '创建固定工作目录。成员引用不会增加跨目录读写权限。',
          ),
        )
      }
      if (dialog.type === 'add-directory') {
        return e(
          Modal,
          {
            ...props,
            title: '添加目录工作区',
            submitDisabled: !text.trim(),
            submitLabel: '添加',
            onSubmit: () =>
              perform(
                async () => {
                  const workspace = await workspaces.create({
                    path: text.trim(),
                  })
                  workspaces.startSession(workspace.workspaceId)
                },
                () => setDialog(null),
              ),
          },
          e(
            'label',
            null,
            '目录完整路径',
            e(
              'div',
              { className: 'dsh-space-path-field' },
              e('input', {
                'aria-label': '目录完整路径',
                'autoFocus': true,
                'value': text,
                'onChange': (event: { target: HTMLInputElement }) =>
                  setText(event.target.value),
              }),
              e(IconButton, {
                icon: 'folder',
                label: '选择目录',
                onClick: () =>
                  perform(async () => {
                    const path = await workspaces.pickDirectory()
                    if (path)
                      setText(path)
                  }),
              }),
            ),
          ),
        )
      }
      if (
        dialog.type === 'rename-workspace'
        || dialog.type === 'rename-session'
      ) {
        const old
          = dialog.type === 'rename-workspace'
            ? dialog.item.title
            : dialog.session.displayTitle
        return e(
          Modal,
          {
            ...props,
            title:
              dialog.type === 'rename-workspace'
                ? '重命名工作区'
                : '重命名会话',
            submitDisabled: !text.trim() || text.trim() === old,
            onSubmit: () =>
              perform(
                async () => {
                  if (dialog.type === 'rename-workspace') {
                    await workspaces.rename(
                      dialog.item.workspaceId,
                      text.trim(),
                    )
                  }
                  else {
                    const binding = sessions.binding(dialog.session.id)
                    if (!binding)
                      throw new Error('会话暂不可用，请重新打开后重试')
                    const result = await binding.session.rename(text.trim())
                    if (!result.ok)
                      throw new Error(result.error?.message ?? '重命名失败')
                  }
                },
                () => setDialog(null),
              ),
          },
          input('名称'),
        )
      }
      if (dialog.type === 'edit-space') {
        const item = dialog.item
        const latest = items.find(
          row => row.workspaceId === item.workspaceId,
        )
        const stale = latest?.revision !== item.revision
        return e(
          Modal,
          {
            ...props,
            title: `编辑成员 · ${item.title}`,
            submitDisabled: !item.revision,
            onSubmit: () =>
              perform(
                async () => {
                  await runOperation({
                    op: 'save-members',
                    workspace: item.workspaceId,
                    ...members,
                    expectedRevision: item.revision,
                  })
                  refresh()
                },
                () => {
                  setDialog(null)
                  setNotice('成员已保存')
                },
              ),
          },
          e('small', { className: 'dsh-space-muted' }, item.path),
          stale
            ? e(
                'div',
                {
                  className: 'dsh-space-notice dsh-space-error',
                  role: 'status',
                },
                '描述已变更或暂不可用。',
                e(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-space-button',
                    onClick: () =>
                      perform(async () => {
                        const result = await fetchRegistry()
                        const fresh = result.items.find(
                          row =>
                            row.workspaceId === item.workspaceId
                            && row.kind === 'space',
                        )
                        if (!fresh)
                          throw new Error('该空间描述已不存在，当前草稿未保存')
                        setRegistry(result)
                        setDialog({ type: 'edit-space', item: fresh })
                        setMembers({
                          members: structuredClone(fresh.members ?? []),
                          primary: fresh.primary,
                        })
                      }),
                  },
                  '放弃草稿并重新载入',
                ),
              )
            : null,
          e(MemberEditor, {
            onPick,
            draft: members,
            setDraft: setMembers,
            original: item.members,
          }),
          e(
            'small',
            { className: 'dsh-space-muted' },
            '主成员只影响组织展示，不改变会话的工作目录。',
          ),
        )
      }
      if (dialog.type === 'invalid') {
        return e(
          Modal,
          { ...props, title: '失效附加描述' },
          e(
            'p',
            { className: 'dsh-space-muted' },
            '核心工作区已移除。清理以下附加描述不会删除目录或会话日志。',
          ),
          ...(['space', 'chat'] as const).flatMap(
            kind =>
              (kind === 'space'
                ? registry?.invalidSpaces
                : registry?.invalidChats
              )?.map(row =>
                e(
                  'div',
                  { className: 'dsh-space-member-head', key: row.workspaceId },
                  e(
                    'code',
                    { className: 'dsh-space-member-main dsh-space-muted' },
                    row.workspaceId,
                  ),
                  e(IconButton, {
                    icon: 'remove',
                    label: `清理 ${row.workspaceId}`,
                    onClick: () => begin({
                      type: 'drop-invalid',
                      kind,
                      workspaceId: row.workspaceId,
                    }),
                  }),
                ),
              ) ?? [],
          ),
        )
      }
      if (dialog.type === 'drop-invalid') {
        return e(
          Modal,
          {
            ...props,
            title: '清理失效描述',
            danger: true,
            submitLabel: '确认清理',
            submitDisabled: !registry,
            onSubmit: () => perform(async () => {
              const fresh = await fetchRegistry()
              const invalid = dialog.kind === 'space' ? fresh.invalidSpaces : fresh.invalidChats
              if (!invalid.some(row => row.workspaceId === dialog.workspaceId))
                throw new Error('记录状态已变更，请关闭后重新检查')
              await runOperation({
                op: dialog.kind === 'space' ? 'drop-space' : 'drop-chat',
                workspace: dialog.workspaceId,
              })
              refresh()
            }, () => {
              setDialog(null)
              setNotice('失效描述已清理')
            }),
          },
          e('code', { className: 'dsh-space-muted' }, dialog.workspaceId),
          e('p', null, '只清理这条附加描述。目录、源文件、符号链接与会话日志都会保留。'),
        )
      }
      if (!('item' in dialog))
        return null
      const item = dialog.item
      const deleting = dialog.type === 'delete-workspace'
      return e(
        Modal,
        {
          ...props,
          title: deleting ? '移除工作区' : '移除附加描述',
          danger: deleting,
          submitLabel: deleting ? '移除工作区' : '转为普通目录',
          submitDisabled: !registry,
          onSubmit: () =>
            perform(
              async () => {
                const fresh = await fetchRegistry()
                const current = fresh.items.find(row => row.workspaceId === item.workspaceId)
                if (descriptionRemoved.current !== item.workspaceId) {
                  if (!current || current.kind !== item.kind || current.revision !== item.revision)
                    throw new Error('工作区描述已变更，请关闭后重新检查')
                }
                else if (current?.kind !== 'plain') {
                  throw new Error('核心登记或附加描述已变更，请关闭后重新检查')
                }
                if (
                  item.kind !== 'plain'
                  && descriptionRemoved.current !== item.workspaceId
                ) {
                  await runOperation({
                    op: item.kind === 'space' ? 'drop-space' : 'drop-chat',
                    workspace: item.workspaceId,
                  })
                  descriptionRemoved.current = item.workspaceId
                  refresh()
                }
                if (deleting) {
                  try {
                    await workspaces.delete(item.workspaceId)
                  }
                  catch (cause) {
                    throw new Error(
                      `${descriptionRemoved.current ? '附加描述已移除；' : ''}核心登记移除失败：${message(cause)}。可重试。`,
                    )
                  }
                }
              },
              () => {
                setDialog(null)
                setNotice(
                  deleting ? '工作区登记已移除' : '已转为普通目录工作区',
                )
              },
            ),
        },
        e('strong', null, item.title),
        e('small', { className: 'dsh-space-muted' }, item.path),
        e(
          'p',
          null,
          deleting
            ? '移除工作区登记与附加描述。目录、源文件和会话日志都会保留。'
            : '只移除空间或独立对话描述。保留核心工作区、目录、会话与已有符号链接。',
        ),
      )
    }
    const openSearch = (): void => {
      focusSearch.current = true
      expandSidebar?.()
      searchInput.current?.focus()
    }
    const openSpace = (): void => {
      expandSidebar?.()
      begin({ type: 'create-space' })
    }
    const normalizedQuery = query.trim()
    const search = searchRows(
      normalizedQuery,
      items,
      sessionState,
      workspaceState.archivedSessionIds,
      remoteSearch.query === normalizedQuery
        ? remoteSearch
        : { items: [], hasMore: false },
      sessions.searchResultLimit,
    )
    const notices = e(
      'div',
      { 'aria-live': 'polite' },
      registryError
        ? e(
            'div',
            { className: 'dsh-space-notice dsh-space-error' },
            '附加描述暂不可用，当前显示核心目录。',
            e(IconButton, {
              icon: 'refresh',
              label: '重试附加描述',
              onClick: refresh,
            }),
          )
        : null,
      workspaceState.state === 'error'
        ? e(
            'div',
            { className: 'dsh-space-notice dsh-space-error', role: 'alert' },
            workspaceState.error?.message ?? '核心工作区加载失败',
            e(
              'button',
              {
                type: 'button',
                className: 'dsh-space-button',
                disabled: busy,
                onClick: () => perform(() => workspaces.refresh()),
              },
              '重新连接',
            ),
          )
        : null,
      registry
      && registry.invalidSpaces.length + registry.invalidChats.length > 0
        ? e(
            'div',
            { className: 'dsh-space-notice' },
            e(
              'button',
              {
                type: 'button',
                className: 'dsh-space-button',
                disabled: busy,
                onClick: () => begin({ type: 'invalid' }),
              },
              `${registry.invalidSpaces.length + registry.invalidChats.length} 条失效描述`,
            ),
          )
        : null,
      error && !dialog
        ? e(
            'div',
            { className: 'dsh-space-notice dsh-space-error', role: 'alert' },
            error,
            chatId.current
              ? e(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-space-button',
                    disabled: busy,
                    onClick: createChat,
                  },
                  '重试进入',
                )
              : null,
          )
        : null,
      notice
        ? e(
            'div',
            { className: 'dsh-space-feedback', role: 'status' },
            e(Icon, { name: 'check', size: 12 }),
            notice,
          )
        : null,
    )
    if (!wide) {
      return e(
        'div',
        { className: 'dsh-space-root dsh-space-rail' },
        renderDialog(),
        e(IconButton, {
          icon: 'search',
          label: '搜索会话',
          onClick: openSearch,
        }),
        e(IconButton, {
          icon: 'layers',
          label: '创建空间',
          disabled: busy || !registry,
          onClick: openSpace,
        }),
        e(IconButton, {
          icon: 'chat',
          label: '新建独立对话',
          disabled: busy || !registry,
          onClick: createChat,
        }),
        error
          ? e(IconButton, {
              icon: 'refresh',
              label: error,
              onClick: expandSidebar ?? (() => {}),
            })
          : null,
      )
    }
    return e(
      'div',
      { className: 'dsh-space-root' },
      renderDialog(),
      e(
        'div',
        { className: 'dsh-space-toolbar' },
        e('span', { className: 'dsh-space-toolbar-title' }, '工作区'),
        e(IconButton, {
          icon: 'chat',
          label: '新建独立对话',
          disabled: busy || !registry,
          onClick: createChat,
        }),
        e(Menu, {
          label: '添加工作区',
          icon: 'plus',
          disabled: busy,
          actions: [
            {
              label: '创建空间',
              icon: 'layers',
              disabled: !registry,
              run: openSpace,
            },
            {
              label: '添加目录工作区',
              icon: 'folderPlus',
              run: () => begin({ type: 'add-directory' }),
            },
          ],
        }),
      ),
      e(
        'div',
        { className: 'dsh-space-search-wrap' },
        e(Icon, { name: 'search', size: 14 }),
        e('input', {
          'ref': searchInput,
          'className': 'dsh-space-search',
          'type': 'search',
          'value': query,
          'placeholder': '搜索会话或工作区',
          'aria-label': '搜索会话或工作区',
          'onChange': (event: { target: HTMLInputElement }) =>
            setQuery(event.target.value),
          'onKeyDown': (event: KeyboardEvent) => {
            if (event.key === 'Escape')
              setQuery('')
          },
        }),
      ),
      notices,
      e(
        'div',
        { className: 'dsh-space-list' },
        normalizedQuery
          ? e(
              'div',
              { 'aria-busy': remoteSearch.loading },
              ...search.items.map(row =>
                e(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-space-search-row',
                    key: row.id,
                    onClick: () => {
                      setQuery('')
                      sessions.open(row.id)
                    },
                  },
                  e('strong', null, row.displayTitle),
                  e('small', null, row.workspaceTitle),
                  row.snippet
                    ? e('small', { title: row.snippet }, row.snippet)
                    : null,
                ),
              ),
              remoteSearch.loading
                ? e(
                    'div',
                    { className: 'dsh-space-empty', role: 'status' },
                    '搜索中…',
                  )
                : null,
              remoteSearch.error
                ? e(
                    'div',
                    {
                      className: 'dsh-space-notice dsh-space-error',
                      role: 'alert',
                      title: remoteSearch.error,
                    },
                    '全文搜索暂不可用，已保留标题匹配。',
                    e(IconButton, {
                      icon: 'refresh',
                      label: '重试搜索',
                      onClick: () => setSearchRevision(value => value + 1),
                    }),
                  )
                : null,
              search.hasMore
                ? e(
                    'div',
                    { className: 'dsh-space-empty' },
                    '结果较多，请缩小范围',
                  )
                : null,
              !remoteSearch.loading && search.items.length === 0
                ? e('div', { className: 'dsh-space-empty' }, '没有匹配结果')
                : null,
            )
          : e(
              'div',
              null,
              ...items.map(renderGroup),
              workspaceState.phase === 'ready' && buckets.misc.length
                ? e(
                    'section',
                    { className: 'dsh-space-group' },
                    e(
                      'div',
                      { className: 'dsh-space-toolbar-title' },
                      '未归组',
                    ),
                    ...buckets.misc.map(row => renderSession(row)),
                  )
                : null,
              workspaceState.phase === 'pending'
              || sessionState.phase === 'pending'
                ? e(
                    'div',
                    { className: 'dsh-space-empty', role: 'status' },
                    '加载工作区…',
                  )
                : null,
              workspaceState.phase === 'ready' && !items.length
                ? e(
                    'div',
                    { className: 'dsh-space-empty' },
                    e(Icon, { name: 'folder', size: 24 }),
                    e(
                      'span',
                      { className: 'dsh-space-empty-title' },
                      '暂无工作区',
                    ),
                    e(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-space-button',
                        disabled: busy,
                        onClick: () => begin({ type: 'add-directory' }),
                      },
                      '添加目录工作区',
                    ),
                  )
                : null,
            ),
      ),
    )
  }
}
