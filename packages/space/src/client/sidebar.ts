import type { MenuAction } from './controls.ts'
import type { LayoutEntry, Pin, SectionId } from './layout.ts'
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
import { createDetails } from './details.ts'
import { createLayoutStore, projectLayout, visibleEntries } from './layout.ts'
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
    | { type: 'chat-directories' }

interface InfoState {
  target: Pin
  anchor: HTMLElement
  edit: boolean
  focus: boolean
}

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
  const Details = createDetails(React)
  const layoutStore = createLayoutStore()
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
    const [operationBusy, setBusy] = React.useState(false)
    const [info, setInfo] = React.useState<InfoState | null>(null)
    const [infoEditing, setInfoEditing] = React.useState(false)
    const infoEditingRef = React.useRef(false)
    const infoTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const anchors = React.useRef(new Map<string, HTMLElement>())
    const busy = operationBusy || infoEditing
    const busyRef = React.useRef(false)
    const createdId = React.useRef<string | undefined>(undefined)
    const chatId = React.useRef<string | undefined>(undefined)
    const descriptionRemoved = React.useRef<string | undefined>(undefined)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [notice, setNotice] = React.useState('')
    const [collapsed, setCollapsed] = React.useState(readCollapsed)
    const layout = React.useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot)
    const [expandedLists, setExpandedLists] = React.useState<string[]>([])
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
    const dragSection = React.useRef<SectionId | undefined>(undefined)
    const dragPin = React.useRef<Pin | undefined>(undefined)
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
    const sections = React.useMemo(() => projectLayout(items, buckets, layout.pins), [items, buckets, layout.pins])
    const ownsCurrent = (entry: LayoutEntry): boolean => entry.kind === 'session'
      ? entry.session.id === sessionState.current
      : entry.rows.some(row => row.id === sessionState.current)
    const currentSection = layout.sections.find(id => sections[id].some(ownsCurrent))
    React.useEffect(() => {
      if (info && !info.anchor.isConnected && !infoEditingRef.current)
        setInfo(null)
    }, [info, infoEditing, wide, query, sections])

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
    React.useEffect(() => () => clearTimeout(infoTimer.current), [])
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
      if (currentSection)
        layoutStore.setCollapsed(currentSection, false)
    }, [sessionState.current, currentSection])
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
    const stopInfoTimer = (): void => clearTimeout(infoTimer.current)
    const leaveInfo = (): void => {
      stopInfoTimer()
      infoTimer.current = setTimeout(() => {
        if (!infoEditingRef.current && !document.querySelector('.dsh-space-details')?.contains(document.activeElement))
          setInfo(null)
      }, 220)
    }
    const showInfo = (target: Pin, edit = false, hover = false): void => {
      stopInfoTimer()
      if (busyRef.current || infoEditingRef.current || dialog)
        return
      const anchor = anchors.current.get(JSON.stringify(target))
      if (!anchor?.isConnected)
        return
      const show = (): void => {
        if (anchor.isConnected && !infoEditingRef.current && !busyRef.current)
          setInfo({ target, anchor, edit, focus: !hover })
      }
      if (hover)
        infoTimer.current = setTimeout(show, 450)
      else
        show()
    }
    const anchorRef = (target: Pin): ((node: HTMLElement | null) => void) => (node) => {
      if (node)
        anchors.current.set(JSON.stringify(target), node)
      else
        anchors.current.delete(JSON.stringify(target))
    }
    const rename = async (target: Pin, title: string): Promise<void> => {
      if (target.kind === 'workspace') {
        await workspaces.rename(target.id, title)
      }
      else {
        const binding = sessions.binding(target.id)
        if (!binding)
          throw new Error('会话暂不可用，请重新打开后重试')
        const result = await binding.session.rename(title)
        if (!result.ok)
          throw new Error(result.error?.message ?? '重命名失败')
      }
    }
    const begin = (next: Dialog): void => {
      if (busyRef.current || infoEditingRef.current)
        return
      stopInfoTimer()
      setInfo(null)
      createdId.current = undefined
      descriptionRemoved.current = undefined
      setError(undefined)
      setText(
        next.type === 'rename-workspace'
          ? next.item.title
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
    const isPinned = (pin: Pin): boolean => layout.pins.some(value => value.kind === pin.kind && value.id === pin.id)
    const pinAction = (pin: Pin): MenuAction => ({
      label: isPinned(pin) ? '取消置顶' : '置顶',
      icon: isPinned(pin) ? 'unpin' : 'pin',
      run: () => layoutStore.setPinned(pin, !isPinned(pin)),
    })
    const entryPin = (entry: LayoutEntry): Pin => entry.kind === 'workspace'
      ? { kind: 'workspace', id: entry.item.workspaceId }
      : { kind: 'session', id: entry.session.id }
    const pinnedMoves = (pin: Pin): MenuAction[] => {
      const pins = sections.pinned.map(entryPin)
      const index = pins.findIndex(value => value.kind === pin.kind && value.id === pin.id)
      return ([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移' : '下移',
        icon: direction === -1 ? 'up' : 'down',
        disabled: index < 0 || index + direction < 0 || index + direction >= pins.length,
        run: () => layoutStore.movePin(pin, direction < 0 ? pins[index - 1] : pins[index + 2]),
      }))
    }
    const archive = (session: SessionRow): void => perform(async () => {
      await workspaces.archiveSession(session.id)
      layoutStore.setPinned({ kind: 'session', id: session.id }, false)
      setNotice('会话已归档')
    })
    const workspacePeers = (item: RegistryItem): RegistryItem[] => items.filter(row =>
      (row.kind === 'chat') === (item.kind === 'chat')
      && !isPinned({ kind: 'workspace', id: row.workspaceId }),
    )
    const sessionActions = (
      session: SessionRow,
      item?: RegistryItem,
    ): MenuAction[] => {
      const pin: Pin = { kind: 'session', id: session.id }
      const core = item && { ...item, sessionIds: (buckets.rows.get(item.workspaceId) ?? []).filter(row => !isPinned({ kind: 'session', id: row.id })).map(row => row.id) }
      return [
        pinAction(pin),
        ...(item && item.kind !== 'chat' ? [{ label: '查看信息', icon: 'info' as const, run: () => showInfo(pin) }] : []),
        {
          label: '重命名',
          icon: 'edit',
          run: () => showInfo(pin, true),
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
        ...(isPinned(pin)
          ? pinnedMoves(pin)
          : item?.kind === 'chat'
            ? []
            : ([-1, 1] as const).map(direction => ({
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
              }))),
        {
          label: '归档会话',
          icon: 'archive',
          run: () => archive(session),
        },
      ]
    }
    const workspaceActions = (item: RegistryItem): MenuAction[] => [
      ...(item.kind === 'chat' ? [] : [pinAction({ kind: 'workspace', id: item.workspaceId })]),
      ...(item.kind === 'chat' ? [] : [{ label: '查看信息', icon: 'info' as const, run: () => showInfo({ kind: 'workspace', id: item.workspaceId }) }]),
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
        run: () => item.kind === 'chat' ? begin({ type: 'rename-workspace', item }) : showInfo({ kind: 'workspace', id: item.workspaceId }, true),
      },
      ...(isPinned({ kind: 'workspace', id: item.workspaceId })
        ? pinnedMoves({ kind: 'workspace', id: item.workspaceId })
        : ([-1, 1] as const).map(direction => ({
            label: direction === -1 ? '上移' : '下移',
            icon: direction === -1 ? ('up' as const) : ('down' as const),
            disabled:
          moveAnchor(workspacePeers(item), item.workspaceId, direction)
          === null,
            run: () => {
              const anchor = moveAnchor(
                workspacePeers(item),
                item.workspaceId,
                direction,
              )
              if (anchor !== null)
                perform(() => workspaces.insertBefore(item.workspaceId, anchor))
            },
          }))),
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
      if (busy)
        return
      stopInfoTimer()
      setInfo(null)
      event.currentTarget
        .querySelector<HTMLButtonElement>('.dsh-space-menu-trigger')
        ?.click()
    }
    const dismissInfoOnAction = (event: { target: EventTarget }): void => {
      if (!busy && event.target instanceof Element && event.target.closest('.dsh-space-menu-trigger,.dsh-space-session-main,.dsh-space-heading')) {
        stopInfoTimer()
        setInfo(null)
      }
    }
    const renderSession = (
      session: SessionView,
      item?: RegistryItem,
      flat = false,
    ): unknown => {
      const status = sessionStatus(session)
      return e(
        'div',
        {
          'className': `dsh-space-session${flat ? ' flat' : ''}${sessionState.current === session.id ? ' current' : ''}`,
          'data-session-id': session.id,
          'key': session.id,
          'onContextMenu': openContextMenu,
          'onPointerLeave': leaveInfo,
        },
        e(
          'button',
          {
            'type': 'button',
            'className': 'dsh-space-session-main',
            'ref': anchorRef({ kind: 'session', id: session.id }),
            'disabled': busy,
            'aria-current':
              sessionState.current === session.id ? 'page' : undefined,
            'title': `${session.displayTitle} · ${status.label}`,
            'onPointerEnter': (event: PointerEvent) => {
              if (event.pointerType === 'mouse' && item && item.kind !== 'chat')
                showInfo({ kind: 'session', id: session.id }, false, true)
            },
            'draggable': !busy && isPinned({ kind: 'session', id: session.id }),
            'onDragStart': (event: DragEvent) => {
              dragPin.current = { kind: 'session', id: session.id }
              event.dataTransfer?.setData('text/plain', session.id)
            },
            'onDragEnd': () => { dragPin.current = undefined },
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
        e(IconButton, {
          icon: isPinned({ kind: 'session', id: session.id }) ? 'unpin' : 'pin',
          label: `${isPinned({ kind: 'session', id: session.id }) ? '取消置顶' : '置顶'} ${session.displayTitle}`,
          disabled: busy,
          onClick: () => pinAction({ kind: 'session', id: session.id }).run(),
        }),
        e(IconButton, {
          icon: 'archive',
          label: `归档 ${session.displayTitle}`,
          disabled: busy,
          onClick: () => archive(session),
        }),
        e(Menu, {
          label: `${session.displayTitle} 会话操作`,
          disabled: busy,
          actions: sessionActions(session, item),
        }),
      )
    }
    const renderLimited = <T>(rows: T[], key: string, label: string, current: (row: T) => boolean, render: (row: T) => unknown): unknown => {
      const expanded = expandedLists.includes(key)
      const visible = visibleEntries(rows, expanded, current)
      const hidden = rows.length - visible.length
      return e('div', null, ...visible.map(render), (hidden > 0 || (expanded && rows.length > 5))
        ? e('button', {
            'type': 'button',
            'className': 'dsh-space-show-more',
            'aria-label': `${expanded ? '收起列表' : '展开显示'} ${label}`,
            'aria-expanded': expanded,
            'onClick': () => setExpandedLists(old => expanded ? old.filter(id => id !== key) : [...old, key]),
          }, expanded ? '收起列表' : `展开显示 · ${hidden}`)
        : null)
    }
    const renderGroup = (item: RegistryItem, rows: SessionView[]): unknown => {
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
            if (dragWorkspace.current && !isPinned({ kind: 'workspace', id: item.workspaceId }))
              event.preventDefault()
          },
          onDrop: (event: DragEvent) => {
            const from = dragWorkspace.current
            if (!from || isPinned({ kind: 'workspace', id: item.workspaceId }))
              return
            event.preventDefault()
            event.stopPropagation()
            dragWorkspace.current = undefined
            if (from && from !== item.workspaceId)
              perform(() => workspaces.insertBefore(from, item.workspaceId))
          },
        },
        e(
          'div',
          { className: 'dsh-space-head', onContextMenu: openContextMenu, onPointerLeave: leaveInfo },
          e(
            'button',
            {
              'type': 'button',
              'className': 'dsh-space-heading',
              'ref': anchorRef({ kind: 'workspace', id: item.workspaceId }),
              'disabled': busy,
              'aria-expanded': open,
              'title': item.title,
              'onPointerEnter': (event: PointerEvent) => {
                if (event.pointerType === 'mouse')
                  showInfo({ kind: 'workspace', id: item.workspaceId }, false, true)
              },
              'draggable': !busy,
              'onDragStart': (event: DragEvent) => {
                if (isPinned({ kind: 'workspace', id: item.workspaceId }))
                  dragPin.current = { kind: 'workspace', id: item.workspaceId }
                else
                  dragWorkspace.current = item.workspaceId
                event.dataTransfer?.setData('text/plain', item.workspaceId)
              },
              'onDragEnd': () => {
                dragWorkspace.current = undefined
                dragPin.current = undefined
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
        open ? renderLimited(rows, `workspace:${item.workspaceId}`, item.title, row => row.id === sessionState.current, session => renderSession(session, item)) : null,
      )
    }
    const sectionLabels: Record<SectionId, string> = { pinned: '置顶', chats: '独立对话', workspaces: '工作区' }
    const renderSection = (id: SectionId): unknown => {
      const open = !layout.collapsed.includes(id)
      const index = layout.sections.indexOf(id)
      const actions: MenuAction[] = ([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移分区' : '下移分区',
        icon: direction === -1 ? 'up' : 'down',
        disabled: index + direction < 0 || index + direction >= layout.sections.length,
        run: () => layoutStore.moveSection(id, direction < 0 ? layout.sections[index - 1] : layout.sections[index + 2]),
      }))
      if (id === 'chats')
        actions.push({ label: '管理对话目录', icon: 'folder', run: () => begin({ type: 'chat-directories' }) })
      return e('section', {
        'key': id,
        'className': 'dsh-space-section',
        'aria-label': sectionLabels[id],
        'data-section': id,
        'onDragOver': (event: DragEvent) => {
          if (dragSection.current)
            event.preventDefault()
        },
        'onDrop': (event: DragEvent) => {
          if (!dragSection.current)
            return
          event.preventDefault()
          layoutStore.moveSection(dragSection.current, id)
          dragSection.current = undefined
        },
      }, e('div', { className: 'dsh-space-section-head', onContextMenu: openContextMenu }, e('button', {
        'type': 'button',
        'className': 'dsh-space-section-title',
        'disabled': busy,
        'aria-expanded': open,
        'aria-label': sectionLabels[id],
        'draggable': !busy,
        'onDragStart': (event: DragEvent) => {
          dragSection.current = id
          event.dataTransfer?.setData('text/plain', id)
        },
        'onDragEnd': () => { dragSection.current = undefined },
        'onClick': () => layoutStore.setCollapsed(id, open),
      }, sectionLabels[id], e(Icon, { name: open ? 'chevronDown' : 'chevronRight', size: 12 })), e(Menu, { label: `${sectionLabels[id]}分区操作`, actions, disabled: busy }), id === 'chats' ? e(IconButton, { icon: 'chat', label: '新建独立对话', disabled: busy || !registry, onClick: createChat }) : null, id === 'workspaces'
        ? e(Menu, { label: '添加工作区', icon: 'plus', disabled: busy, actions: [
            { label: '创建空间', icon: 'layers', disabled: !registry, run: () => begin({ type: 'create-space' }) },
            { label: '添加目录工作区', icon: 'folderPlus', run: () => begin({ type: 'add-directory' }) },
          ] })
        : null), open
        ? renderLimited(sections[id], id, sectionLabels[id], ownsCurrent, entry => e('div', {
            key: `${entryPin(entry).kind}:${entryPin(entry).id}`,
            onDragOver: (event: DragEvent) => {
              if (id === 'pinned' && dragPin.current)
                event.preventDefault()
            },
            onDrop: (event: DragEvent) => {
              if (id !== 'pinned' || !dragPin.current)
                return
              event.preventDefault()
              event.stopPropagation()
              layoutStore.movePin(dragPin.current, entryPin(entry))
              dragPin.current = undefined
            },
          }, entry.kind === 'workspace' ? renderGroup(entry.item, entry.rows) : renderSession(entry.session, entry.item, true)))
        : null, open && !sections[id].length ? e('div', { className: 'dsh-space-section-empty' }, id === 'pinned' ? '暂无置顶' : id === 'chats' ? '暂无独立对话' : '暂无工作区') : null)
    }
    const renderDialog = (): unknown => {
      if (!dialog)
        return null
      const props = { busy, error, onClose: close }
      if (dialog.type === 'chat-directories') {
        return e(
          Modal,
          { ...props, title: '对话目录' },
          ...items.filter(item => item.kind === 'chat').map(item => e(
            'div',
            { key: item.workspaceId, className: 'dsh-space-directory-row' },
            e('div', { className: 'dsh-space-heading-text' }, e('strong', null, item.title), e('code', null, item.path)),
            e(IconButton, {
              icon: 'chat',
              label: `在 ${item.title} 中新建会话`,
              disabled: busy,
              onClick: () => {
                close()
                workspaces.startSession(item.workspaceId)
              },
            }),
            e(Menu, { label: `${item.title} 工作区操作`, actions: workspaceActions(item), disabled: busy }),
          )),
          !items.some(item => item.kind === 'chat') ? e('p', { className: 'dsh-space-muted' }, '暂无对话目录') : null,
        )
      }
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
      if (dialog.type === 'rename-workspace') {
        const old = dialog.item.title
        return e(
          Modal,
          {
            ...props,
            title: '重命名工作区',
            submitDisabled: !text.trim() || text.trim() === old,
            onSubmit: () =>
              perform(
                () => rename({ kind: 'workspace', id: dialog.item.workspaceId }, text.trim()),
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
    const renderInfo = (): unknown => {
      if (!info)
        return null
      const target = info.target
      const session = target.kind === 'session' ? sessionState.byId[target.id] : undefined
      const item = target.kind === 'workspace'
        ? items.find(row => row.workspaceId === target.id)
        : items.find(row => row.sessionIds.includes(target.id))
      if ((target.kind === 'workspace' && !item) || (target.kind === 'session' && (!session || workspaceState.archivedSessionIds.includes(target.id))))
        return null
      const title = session?.displayTitle ?? item!.title
      const dismiss = (): void => {
        stopInfoTimer()
        setInfo(null)
      }
      const primary = item?.members?.find(member => member.path === item.primary)
      return e(
        Details,
        {
          key: `${JSON.stringify(target)}:${info.edit}:${info.focus}`,
          title,
          label: target.kind === 'workspace' ? '工作区信息' : '会话信息',
          anchor: info.anchor,
          edit: info.edit,
          focus: info.focus,
          onClose: dismiss,
          onRename: (title: string) => rename(target, title),
          onEditingChange: (editing: boolean) => {
            infoEditingRef.current = editing
            if (editing) {
              stopInfoTimer()
              mode.setBlocked(true)
            }
            setInfoEditing(editing)
          },
          onEnter: stopInfoTimer,
          onLeave: leaveInfo,
        },
        session
          ? e('div', { className: 'dsh-space-muted' }, `${sessionStatus(session).label} · ${new Date(session.updatedAt).toLocaleString()}`)
          : e('div', { className: 'dsh-space-muted' }, `${kindLabel(item!.kind)} · ${buckets.rows.get(item!.workspaceId)?.length ?? 0} 个会话`),
        !session && item
          ? e(
              'button',
              {
                type: 'button',
                className: 'dsh-space-detail-path',
                title: '打开工作目录',
                disabled: busy,
                onClick: () => perform(() => workspaces.openPath(item.path)),
              },
              e(Icon, { name: 'folder' }),
              e('code', null, item.path),
              e(Icon, { name: 'open' }),
            )
          : null,
        session && item && item.kind !== 'chat'
          ? e(
              'button',
              { type: 'button', className: 'dsh-space-detail-path', onClick: () => showInfo({ kind: 'workspace', id: item.workspaceId }) },
              e(Icon, { name: item.kind === 'space' ? 'layers' : 'folder' }),
              item.title,
            )
          : null,
        !session && item?.kind === 'space'
          ? e(
              'button',
              { type: 'button', className: 'dsh-space-detail-path', onClick: () => begin({ type: 'edit-space', item }) },
              e(Icon, { name: 'settings' }),
              `${item.members?.length ?? 0} 个成员${primary ? ` · 主要 ${memberLabel(primary)}` : ''}`,
            )
          : null,
        e(
          'div',
          { className: 'dsh-space-details-actions' },
          e(IconButton, {
            icon: isPinned(target) ? 'unpin' : 'pin',
            label: isPinned(target) ? '取消置顶' : '置顶',
            disabled: busy,
            onClick: () => {
              dismiss()
              pinAction(target).run()
            },
          }),
          session
            ? e(IconButton, {
                icon: 'archive',
                label: '归档会话',
                disabled: busy,
                onClick: () => {
                  dismiss()
                  archive(session)
                },
              })
            : e(IconButton, {
                icon: 'chat',
                label: '新建会话',
                disabled: busy,
                onClick: () => {
                  dismiss()
                  workspaces.startSession(item!.workspaceId)
                },
              }),
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
        { className: 'dsh-space-root dsh-space-rail', onClickCapture: dismissInfoOnAction },
        renderDialog(),
        renderInfo(),
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
      { className: 'dsh-space-root', onClickCapture: dismissInfoOnAction },
      renderDialog(),
      renderInfo(),
      e(
        'div',
        { className: 'dsh-space-search-wrap' },
        e(Icon, { name: 'search', size: 14 }),
        e('input', {
          'ref': searchInput,
          'className': 'dsh-space-search',
          'type': 'search',
          'value': query,
          'disabled': infoEditing,
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
              ...layout.sections.map(renderSection),
              workspaceState.phase === 'ready' && buckets.misc.some(row => !isPinned({ kind: 'session', id: row.id }))
                ? e(
                    'section',
                    { className: 'dsh-space-group' },
                    e(
                      'div',
                      { className: 'dsh-space-toolbar-title' },
                      '未归组',
                    ),
                    ...buckets.misc.filter(row => !isPinned({ kind: 'session', id: row.id })).map(row => renderSession(row, undefined, true)),
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
            ),
      ),
    )
  }
}
