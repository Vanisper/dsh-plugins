/** space.yaml 中的单个成员项目条目 */
export interface SpaceProject {
  /** 相对壳根的路径，POSIX 分隔符（如 `projects/foo`） */
  path: string
  /** 显示名；缺省用路径 basename */
  title?: string
  /** 一句话项目说明，注入空间地图帮助模型定位 */
  desc?: string
}

/** space.yaml 的规范化内容（未知字段在 extras 中原样往返，保证前向兼容） */
export interface SpaceFileData {
  version: 1
  name: string
  projects: SpaceProject[]
  extras: Record<string, unknown>
}

/** 一个已定位的多项目空间 */
export interface Space {
  /** 壳根的规范绝对路径（realpath 后） */
  root: string
  file: SpaceFileData
}

export type ProjectHealth = 'ok' | 'missing' | 'outside-shell'

/** 成员项目的运行时状态（盘点/诊断用） */
export interface ProjectStatus extends SpaceProject {
  /** 壳内表面绝对路径（未经 realpath） */
  absPath: string
  /** 规范真实路径；目录不存在时为空 */
  realPath?: string
  health: ProjectHealth
}

/** dsh 沙盒模式词汇，与 dsh-sandbox-policy 对齐 */
export type SandboxModeName = 'read-only' | 'workspace-write' | 'danger-full-access'
