/**
 * 成员文件夹
 *
 * @description 原地引用的磁盘目录；link 模式额外在壳内 projects/ 下持有 symlink
 */
export interface SpaceFolder {
  /** 真实位置的规范绝对路径（realpath 后） */
  path: string
  /** link = 壳内 symlink 挂入；reference = 只登记不链接 */
  mode: 'link' | 'reference'
  /** link 模式下壳内 symlink 的绝对路径 */
  linkPath?: string
  /** 显示名；缺省时展示端以目录名兜底 */
  title?: string
  /** 一句话说明，注入空间地图帮助模型定位 */
  desc?: string
}

/**
 * 多项目空间实体（「工作区」）
 *
 * @description 建立路径就是建立壳目录；工作区允许多目录——壳为物理入口，
 * 成员是提示词语义上的扩展。sessionId 零持久化：会话归属永远运行时解析
 */
export interface SpaceEntity {
  id: string
  name: string
  /** 托管壳目录的规范绝对路径（创建即建目录；旧数据可无） */
  shell?: string
  /** 主成员的 path：纯字段标记，不联动排序（排序是前端演出，不是数据不变量） */
  primary?: string
  folders: SpaceFolder[]
  /**
   * 核心工作区行绑定：建壳时经幂等 create-or-get 取得
   *
   * @description id-first 纪律——凡接触核心工作区一律先 id 后 path；
   * workspace.path 只是经 id 查出的派生属性，仅用于一致性校验与悬空恢复，
   * 为上游未来把 path 演进为 paths[] 预留最小爆炸半径
   */
  workspaceId?: string
}

/**
 * 对话实体
 *
 * @description 「对话」的建立路径：静默在 chats/<本地日期>/ 下建目录——
 * 静默指位置自动确定（用户不选地方），不是不留痕；目录即实体，
 * 与工作区壳对称：建目录、登记核心工作区行、进注册表。
 * 会话本身仍零记录——哪个会话属于哪个对话由绑定行的 sessionIds 承载（核心账目）
 */
export interface ChatEntity {
  /** 对话目录的规范绝对路径（chats/<日期>/<slug>） */
  path: string
  /** 核心工作区行绑定（id-first；建目录时登记取得） */
  workspaceId?: string
}

export type FolderHealth = 'ok' | 'missing'
/** link 模式下壳内 symlink 的健康度 */
export type LinkHealth = 'ok' | 'broken' | 'none'

/** 成员文件夹的运行时状态（盘点/诊断用） */
export interface FolderStatus extends SpaceFolder {
  health: FolderHealth
  linkHealth: LinkHealth
}

/** dsh 沙盒模式词汇，与 dsh-sandbox-policy 对齐 */
export type SandboxModeName = 'read-only' | 'workspace-write' | 'danger-full-access'

/**
 * 文件夹在当前会话下的写入可达性
 *
 * @description
 * - writable：文件夹完整落在会话 cwd 之内
 * - partial：会话 cwd 在文件夹内部——只有 cwd 子树可写
 * - read-only：不重叠（link 成员经壳内路径写入时同理——realpath 出壳即拒）
 */
export type Writability = 'writable' | 'partial' | 'read-only'
