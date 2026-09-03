export interface RegistryItem {
  kind: 'plain' | 'space' | 'chat'
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  members?: Array<{ path: string, mode: 'reference' | 'link', linkName?: string, title?: string, description?: string }>
  primary?: string
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
  origin?: 'subagent'
  pendingInteraction?: unknown
  completed?: boolean
}

export interface SessionSnapshot {
  ids: string[]
  byId: Record<string, SessionRow>
  current?: string
}

export interface WorkspaceSnapshot {
  items: Array<{ workspaceId: string, path: string, title: string, sessionIds: string[] }>
  archivedSessionIds: string[]
  phase: 'pending' | 'ready'
}

export interface ClientServices {
  sessions: { open: (id: string) => void }
  workspaces: { startSession: (workspaceId?: string) => void, pickDirectory: () => Promise<string | null> }
  slots: { inject: (key: string, factory: () => unknown) => unknown, register: (definition: Record<string, unknown>, component: (props: unknown) => unknown) => unknown }
}
