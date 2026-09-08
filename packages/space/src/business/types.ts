/** 成员只保存插件附加描述；路径是成员真实目录的规范绝对路径 */
export interface MemberData {
  path: string
  mode: 'reference' | 'link'
  linkName?: string
  title?: string
  description?: string
}

/** 一个多项目描述，身份和核心路径均由 workspaceId 指向的核心行提供 */
export interface SpaceData {
  workspaceId: string
  primary?: string
  members: MemberData[]
}

/** 一个对话描述；目录和标题由核心工作区行提供 */
export interface ChatData {
  workspaceId: string
  /** 同一次客户端创建请求的去重标识，不参与会话归属 */
  creationId?: string
}

/** dsh-space 设置分节的完整形状 */
export interface SpaceSettings {
  root: string
  spaces: SpaceData[]
  chats: ChatData[]
}

/** 供 adapter 和客户端使用的核心工作区投影 */
export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
}

/** 核心行存在时的多项目投影 */
export interface SpaceView extends SpaceData, Pick<WorkspaceView, 'path' | 'title' | 'sessionIds'> {
  revision: string
  path: string
  title: string
  status: 'ready'
}

export interface PlainItem {
  kind: 'plain'
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  status: 'ready'
}

export interface SpaceItem extends SpaceView {
  kind: 'space'
}

export interface ChatItem extends ChatView {
  kind: 'chat'
}

export type RegistryItem = PlainItem | SpaceItem | ChatItem

/** 核心行存在时的对话投影 */
export interface ChatView extends ChatData, Pick<WorkspaceView, 'path' | 'title' | 'sessionIds'> {
  path: string
  title: string
  status: 'ready'
}

/** 核心行已经消失的附加记录，只能如实显示为失效 */
export interface InvalidRecord {
  workspaceId: string
  status: 'missing-workspace'
}

export interface RegistrySnapshot {
  root: string
  workspaces: WorkspaceView[]
  items: RegistryItem[]
  spaces: SpaceView[]
  chats: ChatView[]
  invalidSpaces: InvalidRecord[]
  invalidChats: InvalidRecord[]
}
