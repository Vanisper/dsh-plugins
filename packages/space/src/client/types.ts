// 客户端束的最小结构类型（浏览器侧运行时由宿主页面提供，包内不引依赖）
export type ReactNode = unknown

/** require('react') 返回的最小投影（P2 只用到这三件） */
export interface ReactLike {
  createElement: (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) => ReactNode
  useState: <T>(initial: T) => [T, (value: T) => void]
  useEffect: (effect: () => () => void, deps?: unknown[]) => void
}

/** 客户端 cordis 上下文的最小投影 */
export interface ClientContext {
  get: (name: string) => unknown
  effect: (fn: () => () => void, tag?: string) => void
}

/** slots 服务的最小投影（register 返回句柄，inject 负责挂载与卸载级联） */
export interface SlotsLike {
  inject: (key: string, factory: () => unknown) => unknown
  register: (declaration: Record<string, unknown>, component: (props: unknown) => ReactNode) => unknown
}

/** GET /api/dsh-space/registry 的载荷 */
export interface RegistryPayload {
  ok: boolean
  root: string
  spaces: Array<{ id: string, name: string, shell?: string, primary?: string, workspaceId?: string, effectivePath?: string, folders: Array<{ path: string, mode: 'link' | 'reference', title?: string }> }>
  chats: Array<{ path: string, workspaceId?: string }>
  error?: string
}
