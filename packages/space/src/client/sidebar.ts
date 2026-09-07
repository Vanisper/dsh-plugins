import type { MenuAction } from './controls.ts'
import type { DraftSession } from './draft-session.ts'
import type { DisplayGroup, LayoutEntry, Pin, SectionId, SidebarView } from './layout.ts'
import type { MemberDraft } from './member-editor.ts'
import type { ModeStore } from './mode.ts'
import type { SessionView } from './model.ts'
import type {
  ReactLike,
  RegistryItem,
  RegistryPayload,
  SessionRow,
  SessionService,
  SidebarPrimitives,
  SlotProps,
  WorkspaceService,
} from './types.ts'
import { fetchRegistry, runOperation } from './api.ts'
import { createArchiveView } from './archive-view.ts'
import { createControls } from './controls.ts'
import { createDetails } from './details.ts'
import { createGroupEditor } from './group-editor.ts'
import { createLayoutStore, projectLayout, visibleEntries } from './layout.ts'
import { createMemberEditor } from './member-editor.ts'
import {
  groupSessions,
  moveAnchor,
  projectRegistry,
  searchRows,
  sessionMoveAnchor,
} from './model.ts'
import { observeRegistry } from './registry.ts'
import { archivedEntries, projectGroups, sortWorkspaces } from './views.ts'
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
    | { type: 'assign-group', session: SessionRow }
    | { type: 'delete-group', group: DisplayGroup }

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
function updatedLabel(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  return minutes < 1
    ? '刚刚'
    : minutes < 60
      ? `${minutes} 分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} 小时前`
        : `${Math.floor(minutes / 1440)} 天前`
}
function sessionStatus(session: SessionRow & { runningSubagentCount?: number }): {
  state: 'ongoing' | 'warning' | 'done'
  label: string
  visible: boolean
} {
  if (session.pendingInteraction) {
    const label = session.pendingInteraction === 'approval'
      ? '等待审批'
      : session.pendingInteraction === 'plan-review'
        ? '等待计划审阅'
        : session.pendingInteraction === 'question' ? '等待回答' : '等待交互'
    return { state: 'warning', label, visible: true }
  }
  if (session.running)
    return { state: 'ongoing', label: '运行中', visible: true }
  if (session.runningSubagentCount)
    return { state: 'ongoing', label: `${session.runningSubagentCount} 个子代理运行中`, visible: true }
  return { state: 'done', label: session.completed ? '完成未读' : '空闲', visible: !!session.completed }
}

export function createSidebar(
  React: ReactLike,
  sessions: SessionService,
  workspaces: WorkspaceService,
  mode: ModeStore,
  draft: Pick<DraftSession, 'begin' | 'subscribe' | 'getSnapshot'>,
  { StateDot }: SidebarPrimitives,
): (props: SlotProps) => unknown {
  const e = React.createElement
  const beginDraft = draft.begin
  const { Icon, IconButton, Menu, Modal } = createControls(React)
  const MemberEditor = createMemberEditor(React)
  const Details = createDetails(React)
  const GroupEditor = createGroupEditor(React)
  const ArchiveView = createArchiveView(React)
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
    const pendingRenames = React.useRef(new Set<string>())
    const infoTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const anchors = React.useRef(new Map<string, HTMLElement>())
    const [groupDraft, setGroupDraft] = React.useState<{ group: DisplayGroup, original?: DisplayGroup } | null>(null)
    const groupReturnFocus = React.useRef<HTMLElement | null>(null)
    const busy = operationBusy || !!groupDraft
    const busyRef = React.useRef(false)
    const createdId = React.useRef<string | undefined>(undefined)
    const descriptionRemoved = React.useRef<string | undefined>(undefined)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [notice, setNotice] = React.useState('')
    const [archiveOpen, setArchiveOpen] = React.useState(false)
    const [archiveQuery, setArchiveQuery] = React.useState('')
    const [archiveSort, setArchiveSort] = React.useState<'updated' | 'title'>('updated')
    const [archiveConfirmation, setArchiveConfirmation] = React.useState<string | null>(null)
    const [archiveFailure, setArchiveFailure] = React.useState('')
    const [collapsed, setCollapsed] = React.useState(readCollapsed)
    const layout = React.useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot)
    const activeView = groupDraft ? 'groups' : layout.view
    const surfaceKey = archiveOpen ? 'archive' : activeView
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
    const dragSession = React.useRef<string | undefined>(undefined)
    const dragGroup = React.useRef<string | undefined>(undefined)
    const listRef = React.useRef<HTMLDivElement | null>(null)
    const scrollPositions = React.useRef<Record<string, number>>({})
    const archiveRows = React.useRef(new Map<string, HTMLElement>())
    const confirmationControl = React.useRef<HTMLButtonElement | null>(null)
    const sessionState = React.useSyncExternalStore(
      subscribeSessions,
      readSessions,
    )
    const draftState = React.useSyncExternalStore(draft.subscribe, draft.getSnapshot)
    const draftWorkspaceId = sessionState.current === undefined && draftState.active ? draftState.targetId : undefined
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
    const sections = React.useMemo(() => {
      const sorted = sortWorkspaces(items, buckets, layout.workspaceSort)
      return projectLayout(sorted.items, sorted.buckets, layout.pins)
    }, [items, buckets, layout.pins, layout.workspaceSort])
    const groups = React.useMemo(() => projectGroups(items, buckets, layout), [items, buckets, layout])
    const ownsCurrent = (entry: LayoutEntry): boolean => entry.kind === 'session'
      ? entry.session.id === sessionState.current
      : entry.item.workspaceId === draftWorkspaceId || entry.rows.some(row => row.id === sessionState.current)
    const currentSection = layout.sections.find(id => sections[id].some(ownsCurrent))
    const currentGroup = layout.assignments[sessionState.current ?? '']
    React.useEffect(() => {
      if (activeView === 'groups' && currentGroup)
        layoutStore.setGroupCollapsed(currentGroup, false)
    }, [sessionState.current, currentGroup, activeView])
    React.useEffect(() => {
      if (info && !info.anchor.isConnected)
        setInfo(null)
    }, [info, wide, query, sections])

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
      if (listRef.current)
        listRef.current.scrollTop = scrollPositions.current[surfaceKey] ?? 0
    }, [surfaceKey])
    React.useEffect(() => {
      if (!archiveConfirmation)
        return
      confirmationControl.current?.focus()
      const cancel = (): void => {
        if (busyRef.current)
          return
        setArchiveConfirmation(null)
        archiveRows.current.get(archiveConfirmation)?.querySelector<HTMLButtonElement>('.dsh-space-session-main')?.focus()
      }
      const key = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        }
      }
      const outside = (event: Event): void => {
        if (!archiveRows.current.get(archiveConfirmation)?.contains(event.target as Node) && !busyRef.current)
          setArchiveConfirmation(null)
      }
      document.addEventListener('keydown', key)
      document.addEventListener('pointerdown', outside)
      document.addEventListener('focusin', outside)
      return () => {
        document.removeEventListener('keydown', key)
        document.removeEventListener('pointerdown', outside)
        document.removeEventListener('focusin', outside)
      }
    }, [archiveConfirmation])
    React.useEffect(() => setArchiveConfirmation(null), [surfaceKey, query, wide, sessionState.current, dialog, groupDraft?.group.id])
    React.useEffect(() => {
      if (archiveConfirmation && workspaceState.archivedSessionIds.includes(archiveConfirmation))
        setArchiveConfirmation(null)
    }, [workspaceState.archivedSessionIds, archiveConfirmation])
    React.useEffect(() => {
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
      }
      catch {
        /* 折叠状态仍在当前页面生效 */
      }
    }, [collapsed])
    React.useEffect(() => {
      const owner = workspaceState.items.find(item => draftWorkspaceId !== undefined
        ? item.workspaceId === draftWorkspaceId
        : item.sessionIds.includes(sessionState.current ?? ''))
      if (owner)
        setCollapsed(old => old.filter(id => id !== owner.workspaceId))
      if (currentSection)
        layoutStore.setCollapsed(currentSection, false)
    }, [sessionState.current, currentSection, draftWorkspaceId])
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
      if (archiveOpen)
        return
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
      setRemoteSearch(previous => ({
        query: normalized,
        loading: true,
        items: previous.query === normalized ? previous.items : [],
        hasMore: previous.query === normalized && previous.hasMore,
      }))
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
    }, [query, searchRevision, archiveOpen])

    const refresh = (): void => setRegistryRevision(value => value + 1)
    const stopInfoTimer = (): void => clearTimeout(infoTimer.current)
    const leaveInfo = (): void => {
      stopInfoTimer()
    }
    const showInfo = (target: Pin, edit = false, hover = false): void => {
      stopInfoTimer()
      if (busyRef.current || dialog || groupDraft || archiveConfirmation)
        return
      const anchor = anchors.current.get(JSON.stringify(target))
      if (!anchor?.isConnected)
        return
      const show = (): void => {
        if (anchor.isConnected && !busyRef.current)
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
      const key = JSON.stringify(target)
      if (pendingRenames.current.has(key))
        throw new Error('此名称正在保存，请稍后重试')
      pendingRenames.current.add(key)
      try {
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
      finally {
        pendingRenames.current.delete(key)
      }
    }
    const begin = (next: Dialog): void => {
      if (busyRef.current || groupDraft)
        return
      stopInfoTimer()
      setInfo(null)
      createdId.current = undefined
      descriptionRemoved.current = undefined
      setError(undefined)
      setText(
        next.type === 'rename-workspace'
          ? next.item.title
          : next.type === 'assign-group'
            ? layout.assignments[next.session.id] ?? ''
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
      beginDraft(id)
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
    const createChat = (): void => beginDraft()
    const toggle = (id: string): void =>
      setCollapsed(old =>
        old.includes(id) ? old.filter(value => value !== id) : [...old, id],
      )
    const changeView = (view: SidebarView): void => {
      if (busy || dialog || archiveOpen)
        return
      stopInfoTimer()
      setInfo(null)
      layoutStore.setView(view)
    }
    const showArchive = (open: boolean): void => {
      if (busy || dialog)
        return
      stopInfoTimer()
      setInfo(null)
      setArchiveOpen(open)
      if (open)
        expandSidebar?.()
    }
    const updateLayout = (task: () => void): void => {
      try {
        task()
      }
      catch (cause) {
        setError(message(cause))
      }
    }
    const editGroup = (group?: DisplayGroup): void => {
      if (busy || dialog)
        return
      groupReturnFocus.current = document.activeElement as HTMLElement
      stopInfoTimer()
      setInfo(null)
      mode.setBlocked(true)
      setGroupDraft({ group: group ?? { id: crypto.randomUUID(), title: '', color: 'gray', collapsed: false }, original: group })
    }
    const closeGroupEditor = (): void => {
      setGroupDraft(null)
      groupReturnFocus.current?.focus()
    }
    const renderGroupEditor = (): unknown => groupDraft
      ? e(GroupEditor, {
          key: groupDraft.group.id,
          group: groupDraft.group,
          onChange: (group: DisplayGroup) => setGroupDraft({ ...groupDraft, group }),
          onSave: (group: DisplayGroup) => {
            layoutStore.saveGroup(group, !groupDraft.original, groupDraft.original)
            closeGroupEditor()
          },
          onCancel: closeGroupEditor,
        })
      : null
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
      const pins = activeView === 'groups' ? groups.pinned.map(entry => ({ kind: 'session' as const, id: entry.session.id })) : sections.pinned.map(entryPin)
      const index = pins.findIndex(value => value.kind === pin.kind && value.id === pin.id)
      return ([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移' : '下移',
        icon: direction === -1 ? 'up' : 'down',
        disabled: index < 0 || index + direction < 0 || index + direction >= pins.length,
        run: () => layoutStore.movePin(pin, direction < 0 ? pins[index - 1] : pins[index + 2]),
      }))
    }
    const archive = (session: SessionRow): void => {
      if (busy)
        return
      stopInfoTimer()
      setInfo(null)
      setArchiveFailure('')
      setArchiveConfirmation(session.id)
    }
    const confirmArchive = (session: SessionRow): void => perform(async () => {
      try {
        await workspaces.archiveSession(session.id)
        layoutStore.setPinned({ kind: 'session', id: session.id }, false)
        setArchiveConfirmation(null)
        setNotice('会话已归档')
      }
      catch (cause) {
        setArchiveFailure(message(cause))
      }
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
          label: '设置展示分组',
          icon: 'hash',
          run: () => begin({ type: 'assign-group', session }),
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
          : item?.kind === 'chat' || activeView === 'groups' || layout.workspaceSort !== 'manual'
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
        run: () => beginDraft(item.workspaceId),
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
        : layout.workspaceSort !== 'manual'
          ? []
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
          'className': `dsh-space-session${flat ? ' flat' : ''}${sessionState.current === session.id ? ' current' : ''}${archiveConfirmation === session.id ? ' confirming' : ''}`,
          'data-session-id': session.id,
          'ref': (node: HTMLElement | null) => {
            if (node)
              archiveRows.current.set(session.id, node)
            else
              archiveRows.current.delete(session.id)
          },
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
            'onPointerEnter': (event: PointerEvent) => {
              if (event.pointerType === 'mouse' && item && item.kind !== 'chat')
                showInfo({ kind: 'session', id: session.id }, false, true)
            },
            'draggable': !busy && (activeView === 'groups' || isPinned({ kind: 'session', id: session.id })),
            'onDragStart': (event: DragEvent) => {
              if (activeView === 'groups')
                dragSession.current = session.id
              else
                dragPin.current = { kind: 'session', id: session.id }
              event.dataTransfer?.setData('text/plain', session.id)
            },
            'onDragEnd': () => {
              dragPin.current = undefined
              dragSession.current = undefined
            },
            'onClick': () => {
              setArchiveConfirmation(null)
              sessions.open(session.id)
            },
          },
          e('span', {
            'className': 'dsh-space-status',
            'role': status.visible ? 'img' : undefined,
            'aria-label': status.visible ? status.label : undefined,
            'aria-hidden': status.visible ? undefined : true,
          }, status.visible ? e(StateDot, { state: status.state }) : null),
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
        e('span', { className: 'dsh-space-session-actions' }, ...(archiveConfirmation === session.id
          ? [
              e('button', {
                'type': 'button',
                'ref': confirmationControl,
                'className': 'dsh-space-archive-confirm',
                'aria-label': `确认归档 ${session.displayTitle}`,
                'disabled': busy,
                'onClick': () => confirmArchive(session),
              }, operationBusy ? '归档中' : '确认'),
              e(IconButton, { icon: 'close', label: '取消归档操作', disabled: busy, onClick: () => {
                setArchiveConfirmation(null)
                archiveRows.current.get(session.id)?.querySelector<HTMLButtonElement>('.dsh-space-session-main')?.focus()
              } }),
            ]
          : [e(IconButton, {
              icon: isPinned({ kind: 'session', id: session.id }) ? 'unpin' : 'pin',
              label: `${isPinned({ kind: 'session', id: session.id }) ? '取消置顶' : '置顶'} ${session.displayTitle}`,
              disabled: busy,
              onClick: () => pinAction({ kind: 'session', id: session.id }).run(),
            }), e(IconButton, {
              icon: 'archive',
              label: `归档 ${session.displayTitle}`,
              disabled: busy,
              onClick: () => archive(session),
            }), e(Menu, {
              label: `${session.displayTitle} 会话操作`,
              disabled: busy,
              actions: sessionActions(session, item),
            })])),
        archiveConfirmation === session.id && archiveFailure ? e('div', { className: 'dsh-space-archive-error dsh-space-error', role: 'alert' }, archiveFailure) : null,
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
      return e(
        'section',
        {
          className: 'dsh-space-group',
          key: item.workspaceId,
          onDragOver: (event: DragEvent) => {
            if (!busy && layout.workspaceSort === 'manual' && dragWorkspace.current && !isPinned({ kind: 'workspace', id: item.workspaceId }))
              event.preventDefault()
          },
          onDrop: (event: DragEvent) => {
            const from = dragWorkspace.current
            if (busy || layout.workspaceSort !== 'manual' || !from || isPinned({ kind: 'workspace', id: item.workspaceId }))
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
          { className: `dsh-space-head${item.workspaceId === draftWorkspaceId ? ' current' : ''}`, onContextMenu: openContextMenu, onPointerLeave: leaveInfo },
          e(
            'button',
            {
              'type': 'button',
              'className': 'dsh-space-heading',
              'ref': anchorRef({ kind: 'workspace', id: item.workspaceId }),
              'disabled': busy,
              'aria-expanded': open,
              'aria-current': item.workspaceId === draftWorkspaceId ? 'location' : undefined,
              'onPointerEnter': (event: PointerEvent) => {
                if (event.pointerType === 'mouse')
                  showInfo({ kind: 'workspace', id: item.workspaceId }, false, true)
              },
              'draggable': !busy && (layout.workspaceSort === 'manual' || isPinned({ kind: 'workspace', id: item.workspaceId })),
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
            onClick: () => beginDraft(item.workspaceId),
          }),
          e(Menu, {
            label: `${item.title} 工作区操作`,
            disabled: busy,
            actions: workspaceActions(item),
          }),
        ),
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
    const renderFlatGroups = (): unknown => {
      const renderEntries = (entries: typeof groups.ungrouped, key: string, label: string): unknown => renderLimited(entries, key, label, entry => entry.session.id === sessionState.current, entry => renderSession(entry.session, entry.item, true))
      const drop = (groupId?: string): { onDragOver: (event: DragEvent) => void, onDrop: (event: DragEvent) => void } => ({
        onDragOver: (event: DragEvent) => {
          if (!busy && (dragSession.current || (groupId && dragGroup.current)))
            event.preventDefault()
        },
        onDrop: (event: DragEvent) => {
          if (busy)
            return
          if (dragSession.current) {
            event.preventDefault()
            event.stopPropagation()
            const id = dragSession.current
            updateLayout(() => layoutStore.assignGroup(id, groupId))
          }
          else if (groupId && dragGroup.current) {
            event.preventDefault()
            event.stopPropagation()
            layoutStore.moveGroup(dragGroup.current, groupId)
          }
          dragSession.current = undefined
          dragGroup.current = undefined
        },
      })
      return e('div', null, groups.pinned.length ? e('section', { 'className': 'dsh-space-section', 'aria-label': '置顶会话' }, e('div', { className: 'dsh-space-section-head' }, e('span', { className: 'dsh-space-toolbar-title' }, '置顶')), renderEntries(groups.pinned, 'groups:pinned', '置顶会话')) : null, ...groups.groups.map(({ group, entries }, index) => e('section', {
        'key': group.id,
        'className': `dsh-space-section dsh-space-display-group group-color-${group.color}`,
        'aria-label': `分组 ${group.title}`,
        'data-display-group': group.id,
        ...drop(group.id),
      }, groupDraft?.original?.id === group.id
        ? renderGroupEditor()
        : e('div', { className: 'dsh-space-section-head', onContextMenu: openContextMenu }, e('button', {
            'type': 'button',
            'className': 'dsh-space-section-title',
            'disabled': busy,
            'aria-expanded': !group.collapsed,
            'aria-label': `展开或收起分组 ${group.title}`,
            'draggable': !busy,
            'onDragStart': (event: DragEvent) => {
              dragGroup.current = group.id
              event.dataTransfer?.setData('text/plain', group.id)
            },
            'onDragEnd': () => { dragGroup.current = undefined },
            'onClick': () => layoutStore.setGroupCollapsed(group.id, !group.collapsed),
          }, e('span', { className: 'dsh-space-group-symbol' }, e(Icon, { name: 'hash', size: 14 })), e('span', { className: 'dsh-space-title' }, group.title), e(Icon, { name: group.collapsed ? 'chevronRight' : 'chevronDown', size: 12 })), e('span', { className: 'dsh-space-count' }, entries.length), e(Menu, { label: `${group.title} 分组操作`, disabled: busy, actions: [
            { label: '编辑分组', icon: 'edit', run: () => editGroup(group) },
            { label: '上移分组', icon: 'up', disabled: index === 0, run: () => layoutStore.moveGroup(group.id, layout.groups[index - 1]?.id) },
            { label: '下移分组', icon: 'down', disabled: index === layout.groups.length - 1, run: () => layoutStore.moveGroup(group.id, layout.groups[index + 2]?.id) },
            { label: '移除分组', icon: 'remove', run: () => begin({ type: 'delete-group', group }) },
          ] })), !group.collapsed ? renderEntries(entries, `group:${group.id}`, group.title) : null, !group.collapsed && !entries.length ? e('div', { className: 'dsh-space-section-empty' }, '暂无会话') : null)), groupDraft && (!groupDraft.original || !layout.groups.some(group => group.id === groupDraft.original?.id)) ? renderGroupEditor() : null, e('section', { 'className': 'dsh-space-section', 'aria-label': '未分组会话', 'data-display-group': '', ...drop() }, layout.groups.length ? e('div', { className: 'dsh-space-section-head' }, e('span', { className: 'dsh-space-toolbar-title' }, '未分组')) : null, renderEntries(groups.ungrouped, 'groups:ungrouped', '未分组会话'), !groups.ungrouped.length ? e('div', { className: 'dsh-space-section-empty' }, '暂无未分组会话') : null))
    }
    const archiveSortActions = (): MenuAction[] => [
      { label: '最近活动', icon: 'clock', checked: archiveSort === 'updated', run: () => setArchiveSort('updated') },
      { label: '按标题', icon: 'edit', checked: archiveSort === 'title', run: () => setArchiveSort('title') },
    ]
    const renderToolbar = (): unknown => {
      const workspaceIds = items.filter(item => item.kind !== 'chat').map(item => item.workspaceId)
      const anyOpen = workspaceIds.some(id => !collapsed.includes(id))
      return e('div', { className: 'dsh-space-view-toolbar' }, e('div', { 'className': 'dsh-space-view-switch', 'role': 'radiogroup', 'aria-label': '侧栏视图' }, ...(['workspaces', 'groups'] as const).map(view => e('button', {
        'key': view,
        'type': 'button',
        'role': 'radio',
        'aria-checked': activeView === view,
        'aria-label': view === 'workspaces' ? '工作区视图' : '分组视图',
        'tabIndex': activeView === view ? 0 : -1,
        'disabled': busy || !!dialog || archiveOpen,
        'onClick': () => changeView(view),
        'onKeyDown': (event: KeyboardEvent) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next = event.key === 'Home' ? 'workspaces' : event.key === 'End' ? 'groups' : view === 'workspaces' ? 'groups' : 'workspaces'
            changeView(next)
            document.querySelector<HTMLButtonElement>(`[aria-label="${next === 'workspaces' ? '工作区视图' : '分组视图'}"]`)?.focus()
          }
        },
      }, e(Icon, { name: view === 'workspaces' ? 'folder' : 'hash', size: 14 }), view === 'workspaces' ? '工作区' : '分组'))), archiveOpen
        ? null
        : activeView === 'workspaces'
          ? e(IconButton, {
              icon: anyOpen ? 'collapse' : 'expand',
              label: anyOpen ? '收起全部工作区' : '展开全部工作区',
              disabled: busy || !workspaceIds.length,
              onClick: () => setCollapsed(old => anyOpen ? [...new Set([...old, ...workspaceIds])] : old.filter(id => !workspaceIds.includes(id))),
            })
          : e(IconButton, { icon: 'hash', label: '新建分组', disabled: busy, onClick: () => editGroup() }), e('span', { className: 'dsh-space-toolbar-spacer' }), e(Menu, { icon: 'filter', label: '排序方式', disabled: busy, actions: archiveOpen
        ? archiveSortActions()
        : activeView === 'workspaces'
          ? [
              { label: '手动排序', icon: 'layers', checked: layout.workspaceSort === 'manual', run: () => layoutStore.setSort({ workspaceSort: 'manual' }) },
              { label: '最近活动', icon: 'clock', checked: layout.workspaceSort === 'updated', run: () => layoutStore.setSort({ workspaceSort: 'updated' }) },
            ]
          : [
              { label: '最近活动', icon: 'clock', checked: layout.sessionSort === 'updated', run: () => layoutStore.setSort({ sessionSort: 'updated' }) },
              { label: '按标题', icon: 'edit', checked: layout.sessionSort === 'title', run: () => layoutStore.setSort({ sessionSort: 'title' }) },
            ] }), e(IconButton, { icon: archiveOpen ? 'close' : 'archive', label: archiveOpen ? '关闭归档' : '查看已归档', disabled: busy, onClick: () => showArchive(!archiveOpen) }))
    }
    const renderArchive = (showHeading = true): unknown => e(ArchiveView, {
      ...archivedEntries(items, sessionState, workspaceState, archiveQuery, archiveSort),
      pending: sessionState.phase !== 'ready' || workspaceState.phase !== 'ready',
      filtered: !!archiveQuery.trim(),
      showHeading,
    })
    const renderDialog = (): unknown => {
      if (!dialog)
        return null
      const props = { busy, error, onClose: close }
      if (dialog.type === 'assign-group') {
        return e(Modal, { ...props, title: '设置展示分组', onSubmit: () => updateLayout(() => {
          layoutStore.assignGroup(dialog.session.id, text || undefined)
          close()
        }) }, e('strong', null, dialog.session.displayTitle), e('label', null, '分组', e('select', {
          'aria-label': '目标分组',
          'value': text,
          'onChange': (event: { target: HTMLSelectElement }) => setText(event.target.value),
        }, e('option', { value: '' }, '未分组'), ...layout.groups.map(group => e('option', { key: group.id, value: group.id }, group.title)))))
      }
      if (dialog.type === 'delete-group') {
        return e(Modal, { ...props, title: '移除展示分组', submitLabel: '移除分组', onSubmit: () => {
          layoutStore.deleteGroup(dialog.group.id)
          close()
          setNotice('分组已移除，会话已保留')
        } }, e('strong', null, dialog.group.title), e('p', null, '仅移除展示分组，会话回到未分组列表。不会删除会话或改变工作区归属。'))
      }
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
                beginDraft(item.workspaceId)
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
                  beginDraft(workspace.workspaceId)
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
        setInfo(current => current === info ? null : current)
      }
      const row = session && (item ? buckets.rows.get(item.workspaceId) : buckets.misc)?.find(row => row.id === session.id)
      const status = session ? sessionStatus(row ?? session) : undefined
      return e(
        Details,
        {
          key: `${JSON.stringify(target)}:${info.edit}:${info.focus}`,
          title,
          icon: session ? 'message' : item!.kind === 'space' ? 'layers' : 'folder',
          variant: session ? 'session' : 'workspace',
          label: target.kind === 'workspace' ? '工作区信息' : '会话信息',
          anchor: info.anchor,
          edit: info.edit,
          focus: info.focus,
          onClose: dismiss,
          onRename: (title: string) => rename(target, title),
          onDetachedError: (cause: unknown) => setError(message(cause)),
          onEnter: stopInfoTimer,
          action: !session || info.focus || info.edit
            ? e(IconButton, {
                icon: isPinned(target) ? 'unpin' : 'pin',
                label: isPinned(target) ? '取消置顶' : '置顶',
                disabled: busy,
                onClick: () => {
                  dismiss()
                  pinAction(target).run()
                },
              })
            : null,
        },
        session
          ? e(
              'div',
              { className: 'dsh-space-detail-meta' },
              !session.blank && Number.isFinite(session.updatedAt)
                ? e('time', { className: 'dsh-space-muted', dateTime: new Date(session.updatedAt).toISOString(), title: new Date(session.updatedAt).toLocaleString() }, updatedLabel(session.updatedAt))
                : null,
              e('div', { className: 'dsh-space-detail-status' }, e(StateDot, { state: status!.state }), status!.label),
              row?.runningSubagentCount && (session.running || session.pendingInteraction)
                ? e('div', { className: 'dsh-space-detail-status' }, e(StateDot, { state: 'ongoing' }), `${row.runningSubagentCount} 个子代理运行中`)
                : null,
            )
          : e('div', { className: 'dsh-space-detail-status' }, e(Icon, { name: 'message' }), `${buckets.rows.get(item!.workspaceId)?.length ?? 0} 个会话`),
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
              e(Icon, { name: 'external', size: 14 }),
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
              'div',
              { className: 'dsh-space-detail-members' },
              e('div', { className: 'dsh-space-detail-caption' }, '成员目录'),
              [...(item.members ?? [])].sort((a, b) => Number(b.path === item.primary) - Number(a.path === item.primary)).map(member => e(
                'button',
                {
                  'key': member.path,
                  'type': 'button',
                  'className': 'dsh-space-detail-path dsh-space-detail-member',
                  'aria-label': `打开成员目录 ${member.path}`,
                  'disabled': busy,
                  'onClick': () => perform(() => workspaces.openPath(member.path)),
                },
                e(Icon, { name: 'folder' }),
                e(
                  'span',
                  { className: 'dsh-space-detail-member-text' },
                  member.title ? e('span', null, member.title) : null,
                  e('code', null, member.path),
                ),
                e(Icon, { name: 'external', size: 14 }),
              )),
            )
          : null,
        !session || info.focus || info.edit
          ? e(
              'div',
              { className: 'dsh-space-details-actions' },
              !session && item?.kind === 'space'
                ? e('button', { type: 'button', className: 'dsh-space-detail-edit', disabled: busy, onClick: () => begin({ type: 'edit-space', item }) }, e(Icon, { name: 'settings', size: 14 }), '编辑成员')
                : null,
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
                : null,
            )
          : null,
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
        groupDraft ? e(Modal, { title: '编辑展示分组', busy: false, onClose: closeGroupEditor }, renderGroupEditor()) : null,
        archiveOpen
          ? e(Modal, { title: '已归档', busy: false, onClose: () => showArchive(false) }, e('div', { className: 'dsh-space-path-field' }, e('input', { 'type': 'search', 'aria-label': '搜索归档会话', 'placeholder': '搜索归档会话', 'value': archiveQuery, 'onChange': (event: { target: HTMLInputElement }) => setArchiveQuery(event.target.value) }), e(Menu, { icon: 'filter', label: '归档排序方式', actions: archiveSortActions() })), renderArchive(false))
          : null,
        e(IconButton, {
          icon: 'search',
          label: '搜索会话',
          onClick: openSearch,
        }),
        e(IconButton, {
          icon: 'archive',
          label: '查看已归档',
          disabled: busy,
          onClick: () => showArchive(true),
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
      renderToolbar(),
      e(
        'div',
        { className: 'dsh-space-search-wrap' },
        e(Icon, { name: 'search', size: 14 }),
        e('input', {
          'ref': searchInput,
          'className': 'dsh-space-search',
          'type': 'search',
          'value': archiveOpen ? archiveQuery : query,
          'disabled': !!groupDraft,
          'placeholder': archiveOpen ? '搜索归档会话' : '搜索会话或工作区',
          'aria-label': archiveOpen ? '搜索归档会话' : '搜索会话或工作区',
          'onChange': (event: { target: HTMLInputElement }) =>
            archiveOpen ? setArchiveQuery(event.target.value) : setQuery(event.target.value),
          'onKeyDown': (event: KeyboardEvent) => {
            if (event.key === 'Escape')
              archiveOpen ? setArchiveQuery('') : setQuery('')
          },
        }),
      ),
      notices,
      e(
        'div',
        { className: 'dsh-space-list', ref: listRef, onScroll: () => { scrollPositions.current[surfaceKey] = listRef.current?.scrollTop ?? 0 } },
        archiveOpen
          ? renderArchive()
          : normalizedQuery
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
            : activeView === 'groups'
              ? renderFlatGroups()
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
