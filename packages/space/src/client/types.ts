export interface MemberItem {
  path: string
  mode: 'reference' | 'link'
  linkName?: string
  title?: string
  description?: string
}

export interface RegistryItem {
  kind: 'plain' | 'space' | 'chat'
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  members?: MemberItem[]
  primary?: string
  revision?: string
}

export interface RegistryPayload {
  ok: boolean
  root: string
  items: RegistryItem[]
  invalidSpaces: Array<{ workspaceId: string, status: string }>
  invalidChats: Array<{ workspaceId: string, status: string }>
  error?: string
}

export interface SessionRow {
  id: string
  displayTitle: string
  updatedAt: number
  running: boolean
  blank: boolean
  parentId?: string
  origin?: 'subagent'
  pendingInteraction?: unknown
  completed?: boolean
}

export interface SessionSnapshot {
  ids: string[]
  byId: Record<string, SessionRow>
  current?: string
  phase: 'pending' | 'ready'
}

export interface CoreWorkspace {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt?: string
  updatedAt?: string
}

export interface WorkspaceSnapshot {
  items: CoreWorkspace[]
  archivedSessionIds: string[]
  state: 'idle' | 'loading' | 'error'
  phase: 'pending' | 'ready'
  error: { message?: string } | null
  baselinesReady: boolean
  recentWorkspaceId?: string
}

export interface SessionSearchResult {
  sessionId: string
  snippet: string
}

export interface RpcResult<T> {
  ok: boolean
  value?: T
  error?: { message?: string }
}

export interface ObservableSnapshot<T> {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => T
}

export interface SessionBinding {
  session: { rename: (title: string) => Promise<RpcResult<unknown>> }
}

export interface SessionService {
  list: ObservableSnapshot<SessionSnapshot>
  searchResultLimit: number
  open: (id: string) => void
  search: (query: string, signal: AbortSignal) => Promise<RpcResult<{ items: SessionSearchResult[], hasMore: boolean }>>
  fork: (input: { sessionId: string, increaseTitle?: boolean }) => Promise<string>
  binding: (id: string) => SessionBinding | undefined
  scope: (id: string) => unknown
}

export interface WorkspaceService {
  list: ObservableSnapshot<WorkspaceSnapshot>
  refresh: () => Promise<void>
  startSession: (workspaceId?: string) => void
  connectWorkspace: (workspaceId: string) => Promise<string>
  create: (input: { path: string }) => Promise<CoreWorkspace>
  pickDirectory: () => Promise<string | null>
  openPath: (path: string) => Promise<void>
  rename: (workspaceId: string, title: string) => Promise<CoreWorkspace>
  delete: (workspaceId: string) => Promise<void>
  insertBefore: (workspaceId: string, beforeWorkspaceId?: string) => Promise<void>
  insertSessionBefore: (workspaceId: string, sessionId: string, beforeSessionId?: string) => Promise<CoreWorkspace>
  archiveSession: (sessionId: string) => Promise<void>
}

export interface SlotProps {
  wide?: boolean
  expandSidebar?: () => void
}

export interface SlotsService {
  inject: (key: string, factory: () => (() => void)) => () => void
  register: <P>(definition: Record<string, unknown>, component: (props: P) => unknown) => () => void
}

/** 宿主会话输入的公开交接面，不调用私有附件或输入实现 */
export interface ConversationService {
  input: {
    for: (scope: unknown) => {
      state: ObservableSnapshot<{ draft: string, imageIds: readonly string[], phase: string }>
      setDraft: (text: string) => void
      submit: () => void
      notify: (level: 'info' | 'error', text: string) => void
    }
  }
  blocks: { storeFor: (id: string) => ObservableSnapshot<{ reason: string } | undefined> }
}

export interface ClientServices {
  sessions: SessionService
  workspaces: WorkspaceService
  slots: SlotsService
}

export interface ReactLike {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown
  useMemo: <T>(factory: () => T, deps: unknown[]) => T
  useRef: <T>(value: T) => { current: T }
  useState: <T>(value: T | (() => T)) => [T, (next: T | ((old: T) => T)) => void]
  useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => void
  useSyncExternalStore: <T>(subscribe: (fn: () => void) => () => void, snapshot: () => T) => T
}

/** 宿主公开状态组件，侧栏只负责状态语义与占位布局 */
export interface SidebarPrimitives {
  StateDot: (props: { state: 'ongoing' | 'warning' | 'done', size?: number }) => unknown
}
