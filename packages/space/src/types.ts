/**
 * 成员文件夹：原地引用的磁盘目录
 *
 * @description 路径在挂载时经 realpath 归一；磁盘位置永不被插件挪动
 */
export interface SpaceFolder {
  /** 规范绝对路径 */
  path: string
  /** 显示名；缺省时展示端以目录名兜底 */
  title?: string
  /** 一句话说明，注入空间地图帮助模型定位 */
  desc?: string
}

/**
 * 多项目空间实体
 *
 * @description 命名实体 + 文件夹引用；空间的身份不锚定任何目录，创建空间与关联文件夹是两个分离的操作
 */
export interface SpaceEntity {
  id: string
  name: string
  /** 主成员的 path：新会话的建议锚点，列表与登记时排首位 */
  primary?: string
  folders: SpaceFolder[]
}

/** cwd 命中空间的解析结果：所属空间 + 所在成员文件夹 */
export interface SpaceHit {
  space: SpaceEntity
  folder: SpaceFolder
}

export type FolderHealth = 'ok' | 'missing'

/** 成员文件夹的运行时状态（盘点/诊断用） */
export interface FolderStatus extends SpaceFolder {
  health: FolderHealth
}

/** dsh 沙盒模式词汇，与 dsh-sandbox-policy 对齐 */
export type SandboxModeName = 'read-only' | 'workspace-write' | 'danger-full-access'

/**
 * 文件夹在当前会话下的写入可达性
 *
 * @description
 * - writable：文件夹完整落在会话 cwd 之内
 * - partial：会话 cwd 在文件夹内部——只有 cwd 子树可写
 * - read-only：不重叠
 */
export type Writability = 'writable' | 'partial' | 'read-only'
