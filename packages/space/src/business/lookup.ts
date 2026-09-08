import type { ChatData, ChatView, InvalidRecord, RegistryItem, SpaceData, SpaceView, WorkspaceView } from './types.ts'
import { spaceRevision } from './member-draft.ts'

export interface DescriptionLookup {
  spaces: Map<string, SpaceData>
  chats: Map<string, ChatData>
}

export function descriptionsOf(spaces: SpaceData[], chats: ChatData[]): DescriptionLookup {
  return {
    spaces: new Map(spaces.map(space => [space.workspaceId, space])),
    chats: new Map(chats.map(chat => [chat.workspaceId, chat])),
  }
}

/** 以核心完整列表为基线构造普通、空间和对话三种投影 */
export function projectDescriptions(workspaces: WorkspaceView[], lookup: DescriptionLookup): {
  items: RegistryItem[]
  spaces: SpaceView[]
  chats: ChatView[]
  invalidSpaces: InvalidRecord[]
  invalidChats: InvalidRecord[]
} {
  const known = new Set(workspaces.map(workspace => workspace.workspaceId))
  const spaces: SpaceView[] = []
  const chats: ChatView[] = []
  const items: RegistryItem[] = []
  for (const workspace of workspaces) {
    const space = lookup.spaces.get(workspace.workspaceId)
    if (space) {
      const item = { kind: 'space' as const, ...workspace, ...space, revision: spaceRevision(space), status: 'ready' as const }
      spaces.push(item)
      items.push(item)
      continue
    }
    const chat = lookup.chats.get(workspace.workspaceId)
    if (chat) {
      const item = { kind: 'chat' as const, ...workspace, ...chat, status: 'ready' as const }
      chats.push(item)
      items.push(item)
      continue
    }
    items.push({ kind: 'plain', ...workspace, status: 'ready' })
  }
  const invalidSpaces = [...lookup.spaces.keys()]
    .filter(workspaceId => !known.has(workspaceId))
    .map(workspaceId => ({ workspaceId, status: 'missing-workspace' as const }))
  const invalidChats = [...lookup.chats.keys()]
    .filter(workspaceId => !known.has(workspaceId))
    .map(workspaceId => ({ workspaceId, status: 'missing-workspace' as const }))
  return { items, spaces, chats, invalidSpaces, invalidChats }
}
