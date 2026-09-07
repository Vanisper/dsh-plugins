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
import type { WorkspaceEdit } from './workspace-edit.ts'
import { fetchRegistry, runOperation } from './api.ts'
import { createArchiveView } from './archive-view.ts'
import { createControls } from './controls.ts'
import { createDetails } from './details.ts'
import { createGroupEditor } from './group-editor.ts'
import { createImeGuard } from './ime.ts'
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
import { createRenameDialog } from './rename-dialog.ts'
import { moveBefore, sessionOrderMoves } from './session-order.ts'
import { archivedEntries, projectGroups, sortWorkspaces } from './views.ts'
import { waitFor } from './wait.ts'
import { createWorkspaceEdit } from './workspace-edit.ts'

type Dialog
  = | { type: 'create-space' }
    | { type: 'add-directory' }
    | { type: 'invalid' }
    | { type: 'drop-invalid', kind: 'space' | 'chat', workspaceId: string }
    | { type: 'rename', target: Pin, title: string }
    | { type: 'delete-workspace', item: RegistryItem }
    | { type: 'drop-description', item: RegistryItem }
    | { type: 'edit-workspace', item: RegistryItem }
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
  primitives: SidebarPrimitives,
): (props: SlotProps) => unknown {
  const e = React.createElement
  const beginDraft = draft.begin
  const { Icon, IconButton, Menu, Modal } = createControls(React)
  const { StateDot } = primitives
  const RenameDialog = createRenameDialog(React, primitives)
  const MemberEditor = createMemberEditor(React)
  const Details = createDetails(React)
  const GroupEditor = createGroupEditor(React)
  const ArchiveView = createArchiveView(React)
  const pathText = (path: string): unknown => e(
    'code',
    { className: 'dsh-space-path-text', dir: 'ltr' },
    ...(path.match(/(?:^[\\/]+)?[^\\/]+[\\/]*|[\\/]+/g) ?? []).flatMap((part, index) => [
      e('span', { key: `part-${index}` }, part),
      e('wbr', { key: `break-${index}` }),
    ]),
  )
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
    const [enhance, setEnhance] = React.useState(false)
    const workspaceEdit = React.useRef<WorkspaceEdit | undefined>(undefined)
    const workspaceEditKey = React.useRef(0)
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
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [searchRevision, setSearchRevision] = React.useState(0)
    const [remoteSearch, setRemoteSearch] = React.useState<RemoteSearch>({
      query: '',
      loading: false,
      items: [],
      hasMore: false,
    })
    const searchInput = React.useRef<HTMLInputElement | null>(null)
    const searchToolbar = React.useRef<HTMLDivElement | null>(null)
    const searchPane = React.useRef<HTMLDivElement | null>(null)
    const restoreSearchFocus = React.useRef(false)
    const searchIme = React.useMemo(createImeGuard, [])
    const dragWorkspace = React.useRef<string | undefined>(undefined)
    const dragSection = React.useRef<SectionId | undefined>(undefined)
    const dragPin = React.useRef<Pin | undefined>(undefined)
    const dragSession = React.useRef<string | undefined>(undefined)
    const dragGroup = React.useRef<string | undefined>(undefined)
    const [dropTarget, setDropTarget] = React.useState<{ kind: 'workspace' | 'session', id: string, after: boolean } | null>(null)
    const dropClass = (kind: 'workspace' | 'session', id: string): string => dropTarget?.kind === kind && dropTarget.id === id ? ` drop-${dropTarget.after ? 'after' : 'before'}` : ''
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
    const visibleSections = layout.sections.filter(id => id !== 'pinned' || sections.pinned.length > 0)
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
      if (!wide)
        return
      // 宿主 React 对 inert 的属性支持与测试环境不同，直接设置 DOM 属性
      searchToolbar.current?.toggleAttribute('inert', searchOpen)
      searchPane.current?.toggleAttribute('inert', !searchOpen)
      if (searchOpen) {
        searchInput.current?.focus()
      }
      else if (restoreSearchFocus.current) {
        searchToolbar.current?.querySelector<HTMLButtonElement>('[aria-label="搜索"]')?.focus()
        restoreSearchFocus.current = false
      }
    }, [wide, searchOpen])
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
    const showInfo = (target: Pin, edit = false, hover = false): void => {
      stopInfoTimer()
      if (busyRef.current || dialog || groupDraft || archiveConfirmation)
        return
      const anchor = anchors.current.get(JSON.stringify(target))
      if (!anchor?.isConnected)
        return
      const show = (): void => {
        if (anchor.isConnected && !busyRef.current) {
          setInfo(current => hover && current?.target.kind === target.kind && current.target.id === target.id
            ? current
            : { target, anchor, edit, focus: !hover })
        }
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
    const loadWorkspaceEditor = (item: RegistryItem): void => {
      workspaceEditKey.current++
      setText(item.title)
      setMembers({ members: structuredClone(item.members ?? []), primary: item.primary })
      setEnhance(item.kind === 'space')
      workspaceEdit.current = createWorkspaceEdit(item, {
        read: fetchRegistry,
        run: runOperation,
        rename: (id, title) => rename({ kind: 'workspace', id }, title),
        accepted: (current) => {
          setMembers({ members: structuredClone(current.members ?? []), primary: current.primary })
          setEnhance(current.kind === 'space')
          refresh()
        },
      })
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
        next.type === 'rename'
          ? next.title
          : next.type === 'assign-group'
            ? layout.assignments[next.session.id] ?? ''
            : '',
      )
      setMembers({ members: [] })
      workspaceEdit.current = undefined
      if (next.type === 'edit-workspace')
        loadWorkspaceEditor(next.item)
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
    const projectRows = (item: RegistryItem): SessionView[] => {
      const rows = (buckets.rows.get(item.workspaceId) ?? []).filter(row => !isPinned({ kind: 'session', id: row.id }))
      return layout.workspaceSort === 'updated' ? [...rows].sort((a, b) => b.updatedAt - a.updatedAt) : rows
    }
    const moveProjectSession = (item: RegistryItem, id: string, before?: string): void => {
      const order = projectRows(item).map(row => row.id)
      const desired = moveBefore(order, id, before)
      if (desired.every((id, index) => id === order[index]))
        return
      perform(async () => {
        const core = workspaces.list.getSnapshot().items.find(row => row.workspaceId === item.workspaceId)
        if (!core)
          throw new Error('工作区已被移除')
        for (const move of sessionOrderMoves(core.sessionIds, desired)) {
          const latest = workspaces.list.getSnapshot().items.find(row => row.workspaceId === item.workspaceId)
          if (!latest?.sessionIds.includes(move.id) || (move.before && !latest.sessionIds.includes(move.before)))
            throw new Error('会话归属已变更，请重新检查列表')
          await workspaces.insertSessionBefore(item.workspaceId, move.id, move.before)
        }
        layoutStore.setSort({ workspaceSort: 'manual' })
      })
    }
    const moveGroupedSession = (id: string, before?: string, groupId?: string): void => updateLayout(() => {
      layoutStore.moveGroupSession({ id, before, groupId, order: [...groups.groups.flatMap(group => group.entries), ...groups.ungrouped].map(entry => entry.session.id) })
    })
    const groupedMoves = (id: string): MenuAction[] => {
      const groupId = layout.assignments[id]
      const peers = (groupId ? groups.groups.find(row => row.group.id === groupId)?.entries : groups.ungrouped) ?? []
      const index = peers.findIndex(row => row.session.id === id)
      return ([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移' : '下移',
        icon: direction === -1 ? 'up' : 'down',
        group: 'order',
        disabled: index < 0 || index + direction < 0 || index + direction >= peers.length,
        run: () => moveGroupedSession(id, peers[direction < 0 ? index - 1 : index + 2]?.session.id, groupId),
      }))
    }
    const sessionActions = (
      session: SessionRow,
      item?: RegistryItem,
    ): MenuAction[] => {
      const pin: Pin = { kind: 'session', id: session.id }
      const core = item && { ...item, sessionIds: projectRows(item).map(row => row.id) }
      return [
        pinAction(pin),
        {
          label: '重命名',
          icon: 'edit',
          run: () => begin({ type: 'rename', target: pin, title: session.displayTitle }),
        },
        {
          label: '设置展示分组',
          group: 'organize',
          icon: 'hash',
          run: () => begin({ type: 'assign-group', session }),
        },
        {
          label: '分叉会话',
          group: 'organize',
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
        ...(activeView === 'groups' && layout.sessionSort !== 'manual'
          ? []
          : isPinned(pin)
            ? pinnedMoves(pin).map(action => ({ ...action, group: 'order' }))
            : activeView === 'groups'
              ? groupedMoves(session.id)
              : !item || item.kind === 'chat'
                  ? []
                  : ([-1, 1] as const).map(direction => ({
                      label: direction === -1 ? '上移' : '下移',
                      group: 'order',
                      icon: direction === -1 ? ('up' as const) : ('down' as const),
                      disabled:
            !core || sessionMoveAnchor(core, session.id, direction) === null,
                      run: () => {
                        if (core) {
                          const anchor = sessionMoveAnchor(core, session.id, direction)
                          if (anchor !== null)
                            moveProjectSession(item, session.id, anchor)
                        }
                      },
                    }))),
        {
          label: '归档会话',
          group: 'archive',
          icon: 'archive',
          run: () => archive(session),
        },
      ]
    }
    const workspaceActions = (item: RegistryItem): MenuAction[] => [
      ...(item.kind === 'chat' ? [] : [pinAction({ kind: 'workspace', id: item.workspaceId })]),
      {
        label: '重命名',
        icon: 'edit',
        run: () => begin({ type: 'rename', target: { kind: 'workspace', id: item.workspaceId }, title: item.title }),
      },
      {
        label: '打开目录',
        icon: 'open',
        group: 'location',
        run: () => perform(() => workspaces.openPath(item.path)),
      },
      ...(isPinned({ kind: 'workspace', id: item.workspaceId })
        ? pinnedMoves({ kind: 'workspace', id: item.workspaceId }).map(action => ({ ...action, group: 'order' }))
        : ([-1, 1] as const).map(direction => ({
            label: direction === -1 ? '上移' : '下移',
            group: 'order',
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
              group: 'edit',
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
      ...(item.kind !== 'chat'
        ? [
            {
              label: '编辑工作区',
              group: 'edit',
              icon: 'settings' as const,
              run: () => begin({ type: 'edit-workspace', item }),
            },
          ]
        : []),
      ...(item.kind !== 'plain'
        ? [
            {
              label: '移除附加描述',
              group: 'remove',
              icon: 'folder' as const,
              run: () => begin({ type: 'drop-description', item }),
            },
          ]
        : []),
      {
        label: '移除工作区',
        group: 'remove',
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
      const pin: Pin = { kind: 'session', id: session.id }
      const canDrag = !busy && (activeView === 'groups' ? layout.sessionSort === 'manual' : isPinned(pin) || (!!item && item.kind !== 'chat'))
      const acceptsSession = (): boolean => canDrag && !isPinned(pin) && !!dragSession.current && (activeView === 'groups' || (!!item && item.sessionIds.includes(dragSession.current)))
      return e(
        'div',
        {
          'className': `dsh-space-session${flat ? ' flat' : ''}${sessionState.current === session.id ? ' current' : ''}${archiveConfirmation === session.id ? ' confirming' : ''}${dropClass('session', session.id)}`,
          'data-session-id': session.id,
          'ref': (node: HTMLElement | null) => {
            if (node)
              archiveRows.current.set(session.id, node)
            else
              archiveRows.current.delete(session.id)
          },
          'key': session.id,
          'onContextMenu': openContextMenu,
          'onDragOver': (event: DragEvent) => {
            if (acceptsSession() || (canDrag && isPinned(pin) && dragPin.current)) {
              event.preventDefault()
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
              setDropTarget({ kind: 'session', id: session.id, after: !isPinned(pin) && event.clientY > rect.top + rect.height / 2 })
            }
          },
          'onDragLeave': (event: DragEvent) => {
            if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
              setDropTarget(null)
          },
          'onDrop': (event: DragEvent) => {
            setDropTarget(null)
            if (canDrag && isPinned(pin) && dragPin.current) {
              event.preventDefault()
              event.stopPropagation()
              layoutStore.movePin(dragPin.current, pin)
              dragPin.current = undefined
            }
            else if (acceptsSession()) {
              event.preventDefault()
              event.stopPropagation()
              const from = dragSession.current!
              dragSession.current = undefined
              const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined
              const after = rect && event.clientY > rect.top + rect.height / 2
              const peers = activeView === 'groups'
                ? (layout.assignments[session.id] ? groups.groups.find(row => row.group.id === layout.assignments[session.id])?.entries : groups.ungrouped)?.map(row => row.session.id) ?? []
                : projectRows(item!).map(row => row.id)
              const before = after ? peers[peers.indexOf(session.id) + 1] : session.id
              if (from !== session.id) {
                if (activeView === 'groups')
                  moveGroupedSession(from, before, layout.assignments[session.id])
                else
                  moveProjectSession(item!, from, before)
              }
            }
          },
          'onPointerLeave': stopInfoTimer,
          'onPointerEnter': (event: PointerEvent) => {
            if (event.pointerType === 'mouse' && item && item.kind !== 'chat')
              showInfo({ kind: 'session', id: session.id }, false, true)
          },
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
            'draggable': canDrag,
            'onDragStart': (event: DragEvent) => {
              if (!canDrag) {
                event.preventDefault()
                return
              }
              stopInfoTimer()
              setInfo(null)
              if (isPinned(pin))
                dragPin.current = pin
              else
                dragSession.current = session.id
              event.dataTransfer?.setData('text/plain', session.id)
            },
            'onDragEnd': () => {
              setDropTarget(null)
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
          className: `dsh-space-group${dropClass('workspace', item.workspaceId)}`,
          key: item.workspaceId,
          onDragOver: (event: DragEvent) => {
            if (!busy && dragWorkspace.current && !isPinned({ kind: 'workspace', id: item.workspaceId })) {
              event.preventDefault()
              const rect = (event.currentTarget as HTMLElement).querySelector('.dsh-space-head')!.getBoundingClientRect()
              setDropTarget({ kind: 'workspace', id: item.workspaceId, after: event.clientY > rect.top + rect.height / 2 })
            }
          },
          onDragLeave: (event: DragEvent) => {
            if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
              setDropTarget(null)
          },
          onDrop: (event: DragEvent) => {
            const from = dragWorkspace.current
            if (busy || !from || isPinned({ kind: 'workspace', id: item.workspaceId }))
              return
            event.preventDefault()
            event.stopPropagation()
            dragWorkspace.current = undefined
            setDropTarget(null)
            if (from !== item.workspaceId) {
              const rect = (event.currentTarget as HTMLElement).querySelector('.dsh-space-head')!.getBoundingClientRect()
              const peers = workspacePeers(item)
              const before = event.clientY > rect.top + rect.height / 2 ? peers[peers.findIndex(row => row.workspaceId === item.workspaceId) + 1]?.workspaceId : item.workspaceId
              if (before !== from)
                perform(() => workspaces.insertBefore(from, before))
            }
          },
        },
        e(
          'div',
          {
            className: `dsh-space-head${item.workspaceId === draftWorkspaceId ? ' current' : ''}`,
            onContextMenu: openContextMenu,
            onPointerLeave: stopInfoTimer,
            onPointerEnter: (event: PointerEvent) => {
              if (event.pointerType === 'mouse')
                showInfo({ kind: 'workspace', id: item.workspaceId }, false, true)
            },
          },
          e(
            'button',
            {
              'type': 'button',
              'className': 'dsh-space-heading',
              'ref': anchorRef({ kind: 'workspace', id: item.workspaceId }),
              'disabled': busy,
              'aria-expanded': open,
              'aria-current': item.workspaceId === draftWorkspaceId ? 'location' : undefined,
              'aria-description': item.kind === 'space' ? '空间项目' : undefined,
              'draggable': !busy,
              'onDragStart': (event: DragEvent) => {
                if (busy) {
                  event.preventDefault()
                  return
                }
                stopInfoTimer()
                setInfo(null)
                if (isPinned({ kind: 'workspace', id: item.workspaceId }))
                  dragPin.current = { kind: 'workspace', id: item.workspaceId }
                else
                  dragWorkspace.current = item.workspaceId
                event.dataTransfer?.setData('text/plain', item.workspaceId)
              },
              'onDragEnd': () => {
                setDropTarget(null)
                dragWorkspace.current = undefined
                dragPin.current = undefined
              },
              'onClick': () => toggle(item.workspaceId),
            },
            e('span', { className: `dsh-space-workspace-icon${item.kind === 'space' ? ' space' : ''}` }, e(Icon, { name: open ? 'open' : 'folder' })),
            e(
              'span',
              { className: 'dsh-space-heading-text' },
              e('span', { className: 'dsh-space-title' }, item.title),
            ),
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
    const sectionLabels: Record<SectionId, string> = { pinned: '置顶', chats: '对话', workspaces: '项目' }
    const renderSection = (id: SectionId): unknown => {
      const open = !layout.collapsed.includes(id)
      const index = visibleSections.indexOf(id)
      const actions: MenuAction[] = ([-1, 1] as const).map(direction => ({
        label: direction === -1 ? '上移分区' : '下移分区',
        icon: direction === -1 ? 'up' : 'down',
        disabled: index + direction < 0 || index + direction >= visibleSections.length,
        run: () => layoutStore.moveSection(id, direction < 0 ? visibleSections[index - 1] : visibleSections[index + 2]),
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
        : null, open && !sections[id].length ? e('div', { className: 'dsh-space-section-empty' }, id === 'chats' ? '暂无对话' : '暂无项目') : null)
    }
    const renderFlatGroups = (): unknown => {
      const renderEntries = (entries: typeof groups.ungrouped, key: string, label: string): unknown => renderLimited(entries, key, label, entry => entry.session.id === sessionState.current, entry => renderSession(entry.session, entry.item, true))
      const drop = (groupId?: string): { onDragOver: (event: DragEvent) => void, onDrop: (event: DragEvent) => void } => ({
        onDragOver: (event: DragEvent) => {
          if (!busy && layout.sessionSort === 'manual' && (dragSession.current || (groupId && dragGroup.current)))
            event.preventDefault()
        },
        onDrop: (event: DragEvent) => {
          if (busy || layout.sessionSort !== 'manual')
            return
          if (dragSession.current) {
            event.preventDefault()
            event.stopPropagation()
            const id = dragSession.current
            moveGroupedSession(id, undefined, groupId)
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
            'draggable': !busy && layout.sessionSort === 'manual',
            'onDragStart': (event: DragEvent) => {
              if (busy || layout.sessionSort !== 'manual') {
                event.preventDefault()
                return
              }
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
      { label: '最近更新', icon: 'clock', checked: archiveSort === 'updated', run: () => setArchiveSort('updated') },
      { label: '按标题', icon: 'edit', checked: archiveSort === 'title', run: () => setArchiveSort('title') },
    ]
    const openSearch = (): void => {
      stopInfoTimer()
      setInfo(null)
      setSearchOpen(true)
      expandSidebar?.()
      searchInput.current?.focus()
    }
    const renderToolbar = (): unknown => {
      const workspaceIds = items.filter(item => item.kind !== 'chat').map(item => item.workspaceId)
      const anyOpen = workspaceIds.some(id => !collapsed.includes(id))
      return e('div', { 'className': 'dsh-space-view-toolbar', 'ref': searchToolbar, 'aria-hidden': searchOpen }, e('div', { 'className': 'dsh-space-view-switch', 'role': 'radiogroup', 'aria-label': '侧栏视图' }, ...(['groups', 'workspaces'] as const).map(view => e('button', {
        'key': view,
        'type': 'button',
        'role': 'radio',
        'aria-checked': activeView === view,
        'aria-label': view === 'workspaces' ? '项目视图' : '分组视图',
        'tabIndex': activeView === view ? 0 : -1,
        'disabled': busy || !!dialog || archiveOpen,
        'onClick': () => changeView(view),
        'onKeyDown': (event: KeyboardEvent) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next = event.key === 'Home' ? 'groups' : event.key === 'End' ? 'workspaces' : view === 'workspaces' ? 'groups' : 'workspaces'
            changeView(next)
            document.querySelector<HTMLButtonElement>(`[aria-label="${next === 'workspaces' ? '项目视图' : '分组视图'}"]`)?.focus()
          }
        },
      }, e(Icon, { name: view === 'workspaces' ? 'folder' : 'hash', size: 14 }), view === 'workspaces' ? '项目' : '分组'))), e('span', { className: 'dsh-space-toolbar-spacer' }), e(IconButton, { icon: 'search', label: '搜索', disabled: busy || !!dialog, onClick: openSearch }), archiveOpen
        ? null
        : activeView === 'workspaces'
          ? e(IconButton, {
              icon: anyOpen ? 'collapse' : 'expand',
              label: anyOpen ? '收起全部工作区' : '展开全部工作区',
              disabled: busy || !workspaceIds.length,
              onClick: () => setCollapsed(old => anyOpen ? [...new Set([...old, ...workspaceIds])] : old.filter(id => !workspaceIds.includes(id))),
            })
          : e(IconButton, { icon: 'hash', label: '新建分组', disabled: busy, onClick: () => editGroup() }), e(Menu, { icon: 'filter', label: '排序方式', disabled: busy, actions: archiveOpen
        ? archiveSortActions()
        : activeView === 'workspaces'
          ? [
              { label: '最近更新', icon: 'clock', checked: layout.workspaceSort === 'updated', run: () => layoutStore.setSort({ workspaceSort: 'updated' }) },
              { label: '手动排序', icon: 'layers', checked: layout.workspaceSort === 'manual', run: () => layoutStore.setSort({ workspaceSort: 'manual' }) },
            ]
          : [
              { label: '最近更新', icon: 'clock', checked: layout.sessionSort === 'updated', run: () => layoutStore.setSort({ sessionSort: 'updated' }) },
              { label: '手动排序', icon: 'layers', checked: layout.sessionSort === 'manual', run: () => layoutStore.setSort({ sessionSort: 'manual' }) },
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
      if (dialog.type === 'rename') {
        return e(
          RenameDialog,
          {
            ...props,
            title: dialog.target.kind === 'workspace' ? '重命名工作区' : '重命名会话',
            value: text,
            disabled: !text.trim() || text.trim() === dialog.title,
            onChange: (value: string) => {
              setText(value)
              setError(undefined)
            },
            onSubmit: () =>
              perform(
                () => rename(dialog.target, text.trim()),
                () => setDialog(null),
              ),
          },
        )
      }
      if (dialog.type === 'edit-workspace') {
        const editor = workspaceEdit.current!
        const { item, saved } = editor.snapshot()
        return e(
          Modal,
          {
            ...props,
            title: '编辑工作区',
            submitDisabled: !text.trim() || !registry,
            cancelLabel: saved ? '关闭' : '取消',
            secondary: e('button', {
              type: 'button',
              className: 'dsh-space-button danger',
              disabled: busy || !registry,
              onClick: () => begin({ type: 'delete-workspace', item }),
            }, '移除工作区'),
            onSubmit: () =>
              perform(
                async () => {
                  await editor.save({ title: text, space: enhance, ...members })
                  refresh()
                },
                () => {
                  setDialog(null)
                  setNotice('工作区已保存')
                },
              ),
          },
          e('label', null, '工作区名称', e('div', { className: 'dsh-space-workspace-name' }, e(Icon, { name: enhance ? 'layers' : 'folder' }), e('input', {
            'aria-label': '工作区名称',
            'value': text,
            'onChange': (event: { target: HTMLInputElement }) => setText(event.target.value),
          }))),
          e('div', { className: 'dsh-space-workspace-path' }, e('span', null, '工作目录'), e('code', null, item.path)),
          error
            ? e(
                'div',
                {
                  className: 'dsh-space-notice dsh-space-error',
                  role: 'status',
                },
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
                            && row.kind !== 'chat',
                        )
                        if (!fresh)
                          throw new Error('工作区已不存在，无法重新载入')
                        setRegistry(result)
                        loadWorkspaceEditor(fresh)
                        setDialog({ type: 'edit-workspace', item: fresh })
                      }),
                  },
                  '放弃未保存修改并重新载入',
                ),
              )
            : null,
          item.kind === 'plain'
            ? e('label', { className: 'dsh-space-enhance' }, e('input', { type: 'checkbox', checked: enhance, onChange: (event: { target: HTMLInputElement }) => {
                setEnhance(event.target.checked)
                if (!event.target.checked)
                  setMembers({ members: [] })
              } }), '增强为空间')
            : null,
          enhance ? e(MemberEditor, { key: workspaceEditKey.current, onPick, draft: members, setDraft: setMembers, original: item.members }) : null,
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
      const dismiss = (reason?: 'leave'): void => {
        if (reason !== 'leave')
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
          meta: session && !session.blank && Number.isFinite(session.updatedAt)
            ? e('time', { className: 'dsh-space-detail-time', dateTime: new Date(session.updatedAt).toISOString(), title: new Date(session.updatedAt).toLocaleString() }, updatedLabel(session.updatedAt))
            : null,
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
              e('div', { className: 'dsh-space-detail-status' }, e(StateDot, { state: status!.state }), status!.label),
              row?.runningSubagentCount && (session.running || session.pendingInteraction)
                ? e('div', { className: 'dsh-space-detail-status' }, e(StateDot, { state: 'ongoing' }), `${row.runningSubagentCount} 个子代理运行中`)
                : null,
            )
          : e('div', { className: 'dsh-space-detail-status' }, e(Icon, { name: 'message' }), `${buckets.rows.get(item!.workspaceId)?.length ?? 0} 个会话${item!.kind === 'space' ? ' · 空间' : ''}`),
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
              pathText(item.path),
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
                  pathText(member.path),
                ),
                e(Icon, { name: 'external', size: 14 }),
              )),
            )
          : null,
        !session || info.focus || info.edit
          ? e(
              'div',
              { className: 'dsh-space-details-actions' },
              !session && item
                ? e('button', { type: 'button', className: 'dsh-space-detail-edit', disabled: busy, onClick: () => begin({ type: 'edit-workspace', item }) }, e(Icon, { name: 'settings' }), '编辑工作区')
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
    const closeSearch = (): void => {
      archiveOpen ? setArchiveQuery('') : setQuery('')
      searchIme.end()
      restoreSearchFocus.current = true
      setSearchOpen(false)
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
      e(
        'div',
        { className: `dsh-space-toolbar-shell${searchOpen ? ' searching' : ''}` },
        renderToolbar(),
        e('div', { 'className': 'dsh-space-search-wrap', 'ref': searchPane, 'aria-hidden': !searchOpen }, e(Icon, { name: 'search', size: 14 }), e('input', {
          'ref': searchInput,
          'className': 'dsh-space-search',
          'type': 'search',
          'value': archiveOpen ? archiveQuery : query,
          'disabled': !!groupDraft,
          'placeholder': archiveOpen ? '搜索归档会话' : '搜索项目或会话',
          'aria-label': archiveOpen ? '搜索归档会话' : '搜索项目或会话',
          'onChange': (event: { target: HTMLInputElement }) =>
            archiveOpen ? setArchiveQuery(event.target.value) : setQuery(event.target.value),
          'onCompositionStart': searchIme.start,
          'onCompositionEnd': searchIme.end,
          'onKeyDown': (event: { key: string, nativeEvent: KeyboardEvent, preventDefault: () => void, stopPropagation: () => void }) => {
            if (event.key === 'Escape' && !searchIme.active(event.nativeEvent)) {
              event.preventDefault()
              event.stopPropagation()
              closeSearch()
            }
          },
        }), e(IconButton, { icon: 'close', label: '关闭搜索', onClick: closeSearch })),
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
                  ...visibleSections.map(renderSection),
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
