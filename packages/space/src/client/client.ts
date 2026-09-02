// ============================================================
// 浏览器侧客户端束（P4 完整形态）：接管 sidebar.workspaces
// ------------------------------------------------------------
// 两段式：工作区（空间卡片：名称/徽标/折叠/成员区/会话行/拖拽排序）
// ｜对话（chats 实体按日期分组 + 未归组杂项）。
// 会话分桶只认核心 workspace 的 sessionIds；插件注册表不按 cwd 猜测归属。
// single 插槽顶替：显式 priority -10（lowest renders），卸载即还原官方浏览器。
// React 纪律：SpaceSidebar 内所有 hook 无条件前置——任何提前 return
// （loading/error 分支）之前不许出现 hook 调用，否则 invariant #310 崩插槽
// 逃生门：localStorage['dsh-space.sidebar.off'] === '1' 时跳过接管注册。
// ============================================================
import type { ClientContext, ReactLike, ReactNode, RegistryPayload, SessionRow, SessionsLike, SlotsLike, WorkspacesLike } from './types.ts'
import { bindingState, groupSessions } from './model.ts'

const CSS = `
.dsp-side{display:flex;flex-direction:column;gap:6px;padding:10px 6px;font-size:12px;color:var(--dsw-alias-label-primary);min-height:0;overflow-y:auto;}
.dsp-sec-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px;}
.dsp-sec-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em;}
.dsp-add{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:1px 8px;font-size:11px;cursor:pointer;line-height:18px;}
.dsp-add:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsp-card{display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 8px 4px;}
.dsp-card.dragging{opacity:.4;}
.dsp-card.drop-target{border-top:2px solid var(--dsw-alias-state-business-primary);}
.dsp-card-head{display:flex;align-items:center;gap:6px;cursor:grab;}
.dsp-chev{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0 2px;font-size:10px;line-height:1;transition:transform .15s ease;}
.dsp-chev.open{transform:rotate(90deg);}
.dsp-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-badge{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;line-height:16px;white-space:nowrap;}
.dsp-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);}
.dsp-count{font-size:10px;color:var(--dsw-alias-label-tertiary);}
.dsp-go{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:1px 8px;font-size:11px;cursor:pointer;line-height:18px;}
.dsp-go:hover{background:var(--dsw-alias-bg-layer-2);}
.dsp-go:disabled{opacity:.45;cursor:not-allowed;}
.dsp-del{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;padding:0 2px;visibility:hidden;}
.dsp-card:hover .dsp-del,.dsp-row:hover .dsp-del,.dsp-member:hover .dsp-del{visibility:visible;}
.dsp-del:hover{color:var(--dsw-alias-state-error-primary);}
.dsp-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);word-break:break-all;padding:2px 0;}
.dsp-members{display:flex;flex-direction:column;gap:1px;margin:2px 0;padding-top:2px;border-top:1px dashed var(--dsw-alias-border-l1);}
.dsp-member{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:6px;font-size:11px;}
.dsp-member:hover{background:var(--dsw-alias-bg-layer-2);}
.dsp-member.rise{animation:dsp-rise .35s var(--ds-ease-in-out,ease);}
@keyframes dsp-rise{from{transform:translateY(var(--dsp-rise-from,0px));opacity:.35;}to{transform:none;opacity:1;}}
.dsp-member-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-member.primary .dsp-member-name{font-weight:600;}
.dsp-primary-badge{font-size:9px;color:var(--dsw-alias-state-business-primary);border:1px solid var(--dsw-alias-state-business-primary);border-radius:999px;padding:0 5px;line-height:14px;animation:dsp-badge-in .25s ease;}
@keyframes dsp-badge-in{from{opacity:0;transform:scale(.6);}to{opacity:1;transform:none;}}
.dsp-mini{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:0 6px;font-size:10px;cursor:pointer;line-height:16px;visibility:hidden;}
.dsp-member:hover .dsp-mini,.dsp-repair{visibility:visible;}
.dsp-mini:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);}
.dsp-row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:7px;cursor:pointer;}
.dsp-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));}
.dsp-row.current{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));}
.dsp-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-border-l2);}
.dsp-dot.running{background:var(--dsw-alias-state-business-primary);}
.dsp-dot.pending{background:var(--dsw-alias-state-warn-primary);}
.dsp-dot.done{background:var(--dsw-alias-state-success-primary);}
.dsp-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-row-time{font-size:10px;color:var(--dsw-alias-label-tertiary);flex:none;}
.dsp-date{display:flex;align-items:center;gap:6px;padding:4px 6px 0;cursor:pointer;}
.dsp-date-text{font-size:10.5px;color:var(--dsw-alias-label-secondary);}
.dsp-form{display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px;}
.dsp-form-row{display:flex;gap:6px;align-items:center;}
.dsp-input{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 8px;font-size:12px;outline:none;}
.dsp-input:focus{border-color:var(--dsw-alias-state-business-primary);}
.dsp-pick{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer;white-space:nowrap;}
.dsp-mode-on{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);}
.dsp-note{padding:2px 6px;color:var(--dsw-alias-label-secondary);font-style:italic;}
.dsp-error{padding:4px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;}
.dsp-modal-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.34);}
.dsp-modal{display:flex;flex-direction:column;gap:18px;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:24px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 20px 56px rgba(0,0,0,.24);font-size:14px;color:var(--dsw-alias-label-primary);}
.dsp-modal-head{display:flex;align-items:center;justify-content:space-between;gap:16px;}
.dsp-modal-title{font-size:22px;font-weight:650;line-height:1.2;}
.dsp-modal-close{width:32px;height:32px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:24px;line-height:1;cursor:pointer;}
.dsp-modal-close:hover{color:var(--dsw-alias-label-primary);}
.dsp-field{display:flex;flex-direction:column;gap:8px;}
.dsp-label{font-size:13px;font-weight:600;}
.dsp-name-field{display:grid;grid-template-columns:44px minmax(0,1fr);min-height:46px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;}
.dsp-name-icon{display:flex;align-items:center;justify-content:center;border-right:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:17px;}
.dsp-modal-input{min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);padding:0 14px;font-size:14px;}
.dsp-name-field:focus-within{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary);}
.dsp-source{display:flex;align-items:center;justify-content:center;min-height:112px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);}
.dsp-source.selected{min-height:64px;justify-content:flex-start;gap:10px;}
.dsp-source-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-source-action{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;}
.dsp-source-action:hover{color:var(--dsw-alias-label-primary);}
.dsp-mode-row{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsp-segment{display:flex;gap:4px;padding:3px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);}
.dsp-segment button{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;}
.dsp-segment button.dsp-mode-on{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);}
.dsp-modal-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:2px;}
.dsp-modal-button{min-height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 18px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;}
.dsp-modal-button.primary{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);}
.dsp-modal-button:disabled{opacity:.45;cursor:not-allowed;}
`

interface SideState {
  status: 'loading' | 'ready' | 'error'
  data?: RegistryPayload
  error?: string
  /** ops 之后自增触发重新拉取 */
  version: number
}

/** MM-DD HH:mm 的朴素本地格式（侧栏够用） */
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** chats/<日期>/<slug> 的日期段与末段名 */
function tailOf(path: string): { date: string, slug: string } {
  const parts = path.replace(/\/+$/, '').split('/')
  const slug = parts.pop() ?? path
  const date = parts.pop() ?? ''
  return { date, slug }
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json() as { ok?: boolean, error?: string } & Record<string, unknown>
  if (!data || data.ok === false)
    throw new Error((data && data.error) || `${path} 失败`)
  return data
}

const COLLAPSE_KEY = 'dsh-space.sidebar.collapsed'
const ESCAPE_KEY = 'dsh-space.sidebar.off'

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = globalThis.localStorage?.getItem(COLLAPSE_KEY)
    return raw ? JSON.parse(raw) as Record<string, boolean> : {}
  }
  catch {
    return {}
  }
}

interface ModuleLoaderGlobal {
  __ModuleLoader__?: { load: (module: { id: string, factory: (require: (id: string) => unknown) => unknown }) => void }
}

const clientInject = ['slots', 'sessions', 'workspaces']

;(globalThis as ModuleLoaderGlobal).__ModuleLoader__?.load({
  id: 'dsh-space',
  factory: (require) => {
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react') as ReactLike

    /** 状态点（官方语义色）：等待交互（warn）＞运行中（business）＞完成未读（success）＞空闲（灰） */
    function dotState(session: SessionRow): { cls: string, label: string } {
      if (session.pendingInteraction)
        return { cls: ' pending', label: '等待你的交互' }
      if (session.running)
        return { cls: ' running', label: '运行中' }
      if (session.completed)
        return { cls: ' done', label: '已完成（未读）' }
      return { cls: '', label: '空闲' }
    }

    interface StableServices {
      sessions: SessionsLike
      workspaces: WorkspacesLike
      subSessions: (cb: () => void) => () => void
      getSessions: () => SessionsLike['list']['getSnapshot'] extends () => infer T ? T : never
      subWorkspaces: (cb: () => void) => () => void
      getWorkspaces: () => WorkspacesLike['list']['getSnapshot'] extends () => infer T ? T : never
    }

    function SpaceSidebar(props: { services: StableServices }): ReactNode {
      const { sessions, workspaces } = props.services
      const el = (tag: string, attrs: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode => React.createElement(tag, attrs, ...children)

      // hooks 全部无条件前置——任何提前 return 之前不许再出现 hook 调用
      const [state, setState] = React.useState<SideState>({ status: 'loading', version: 0 })
      const [form, setForm] = React.useState<{ kind: 'space' | 'chat' | null, name: string, folder: string | null, link: boolean, busy: boolean, error?: string }>({ kind: null, name: '', folder: null, link: false, busy: false })
      const [chatState, setChatState] = React.useState<{ busy: boolean, error?: string }>({ busy: false })
      const [actionError, setActionError] = React.useState<string | undefined>(undefined)
      const [pendingConfirm, setPendingConfirm] = React.useState<{ question: string, fn: () => Promise<unknown> } | null>(null)
      // 折叠记忆（localStorage 持久）
      const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(loadCollapsed)
      // 拖拽排序状态
      const [dragId, setDragId] = React.useState<string | null>(null)
      const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
      // 设主分步动画：step 1 徽标浮现（optimisticPrimary），step 2 FLIP 滑到首位（rise）
      const [optimisticPrimary, setOptimisticPrimary] = React.useState<{ spaceId: string, path: string } | null>(null)
      const [rise, setRise] = React.useState<{ key: string, from: number } | null>(null)

      // 订阅句柄来自注册工厂闭包：引用稳定，避免每 render 重订阅的 churn
      const sessionState = React.useSyncExternalStore(props.services.subSessions, props.services.getSessions)
      const wsState = React.useSyncExternalStore(props.services.subWorkspaces, props.services.getWorkspaces)

      React.useEffect(() => {
        let alive = true
        fetch('/api/dsh-space/registry')
          .then(res => res.json() as Promise<RegistryPayload>)
          .then((data) => {
            if (!alive)
              return
            setState(prev => data && data.ok
              ? { ...prev, status: 'ready', data, error: undefined }
              : { ...prev, status: 'error', error: data?.error ?? 'registry 返回异常' })
          })
          .catch((error: unknown) => {
            if (alive)
              setState(prev => ({ ...prev, status: 'error', error: error instanceof Error ? error.message : String(error) }))
          })
        return () => {
          alive = false
        }
      }, [state.version])

      React.useEffect(() => {
        if (form.kind !== 'space')
          return () => {}
        const closeOnEscape = (event: KeyboardEvent): void => {
          if (event.key === 'Escape' && !form.busy)
            setForm({ kind: null, name: '', folder: null, link: false, busy: false })
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
      }, [form.kind, form.busy])

      const registry = state.status === 'ready' ? state.data : undefined

      const buckets = React.useMemo(
        () => groupSessions(
          { spaces: registry?.spaces ?? [], chats: registry?.chats ?? [] },
          sessionState,
          wsState,
        ),
        [registry, sessionState, wsState],
      )

      if (state.status === 'loading')
        return el('div', { className: 'dsp-side' }, '加载 dsh-space 注册表…')
      if (state.status === 'error')
        return el('div', { className: 'dsp-side' }, `dsh-space 数据面异常：${state.error ?? '未知'}`)

      const refresh = (): void => setState(prev => ({ ...prev, version: prev.version + 1 }))
      const open = (id: string): void => sessions.open(id)
      const toggleCollapse = (key: string): void => {
        setCollapsed((prev) => {
          const next = { ...prev, [key]: !prev[key] }
          try {
            globalThis.localStorage?.setItem(COLLAPSE_KEY, JSON.stringify(next))
          }
          catch { /* 存储不可用时折叠只在本会话内存 */ }
          return next
        })
      }

      /** 绑定徽标：核心基线未完成时不误报，id 或 path 不一致都不可用于新会话 */
      const bindingBadge = (boundId: string, expectedPath: string): { text: string, warn: boolean } => {
        const state = bindingState(boundId, expectedPath, wsState)
        if (state === 'pending')
          return { text: '同步中', warn: false }
        if (state === 'ready')
          return { text: '已绑定', warn: false }
        return { text: state === 'mismatch' ? '绑定错位' : '绑定失效', warn: true }
      }

      /** 新会话只接受已确认存在的核心绑定，不把创建动作变成隐式修复 */
      const startIn = (boundId: string, expectedPath: string): void => {
        if (bindingState(boundId, expectedPath, wsState) === 'ready')
          workspaces.startSession(boundId)
      }

      /** 悬空或错位绑定必须由用户单独触发修复 */
      const rebind = (arg: { space: string } | { chat: string }): void => {
        setActionError(undefined)
        void apiPost('/api/dsh-space/ops', { op: 'rebind', ...arg })
          .then(refresh)
          .catch((error: unknown) => setActionError(error instanceof Error ? error.message : String(error)))
      }

      // —— 创建表单 ——
      const runOp = async (fn: () => Promise<unknown>): Promise<void> => {
        setForm(prev => ({ ...prev, busy: true, error: undefined }))
        try {
          await fn()
          setForm({ kind: null, name: '', folder: null, link: false, busy: false })
          refresh()
        }
        catch (error) {
          setForm(prev => ({ ...prev, busy: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }
      const submitSpace = (): void => {
        const name = form.name.trim()
        if (!name || form.busy)
          return
        void runOp(async () => {
          await apiPost('/api/dsh-space/ops', {
            op: 'create-space',
            name,
            folder: form.folder ?? undefined,
            mode: form.folder ? (form.link ? 'link' : 'reference') : undefined,
          })
        })
      }
      const submitChat = (): void => {
        if (chatState.busy)
          return
        setChatState({ busy: true })
        void apiPost('/api/dsh-space/ops', { op: 'chat' })
          .then((created) => {
            const chat = (created as { chat?: { workspaceId?: string } }).chat
            if (!chat?.workspaceId)
              throw new Error('创建结果缺少核心工作区绑定')
            workspaces.startSession(chat.workspaceId)
            setChatState({ busy: false })
            refresh()
          })
          .catch((error: unknown) => setChatState({ busy: false, error: error instanceof Error ? error.message : String(error) }))
      }

      // —— 卡片维护动作 ——
      // 内联确认条（no-alert 规则禁原生 confirm；侧边栏内嵌确认更贴 UI）
      const confirmDo = (question: string, fn: () => Promise<unknown>): void => setPendingConfirm({ question, fn })
      const confirmBar = pendingConfirm
        ? el('div', { className: 'dsp-form' }, el('div', { className: 'dsp-meta' }, pendingConfirm.question), el('div', { className: 'dsp-form-row' }, el('button', {
            className: 'dsp-go',
            onClick: () => {
              const fn = pendingConfirm.fn
              setPendingConfirm(null)
              void fn().then(refresh).catch((error: unknown) => console.warn('[dsh-space] 操作失败', error))
            },
          }, '确认'), el('button', { className: 'dsp-add', onClick: () => setPendingConfirm(null) }, '取消')))
        : null
      const setPrimaryAt = (space: RegistryPayload['spaces'][number], folderPath: string, fromIndex: number): void => {
        // 分步动画：徽标先浮现（乐观渲染），随后 FLIP 滑到首位
        setOptimisticPrimary({ spaceId: space.id, path: folderPath })
        void apiPost('/api/dsh-space/ops', { op: 'primary', space: space.name, target: folderPath })
          .then(() => {
            refresh()
            globalThis.setTimeout?.(() => {
              setRise({ key: `${space.id}:${folderPath}`, from: fromIndex * 22 })
              globalThis.setTimeout?.(() => setRise(null), 420)
              setOptimisticPrimary(null)
            }, 260)
          })
          .catch((error: unknown) => {
            setOptimisticPrimary(null)
            console.warn('[dsh-space] 设主失败', error)
          })
      }

      // —— 拖拽排序（重排 spaces 数组 = 重排展示序）——
      const onCardDrop = (targetId: string): void => {
        if (!dragId || dragId === targetId || !registry)
          return
        const ids = registry.spaces.map(space => space.id)
        const from = ids.indexOf(dragId)
        const to = ids.indexOf(targetId)
        if (from < 0 || to < 0)
          return
        ids.splice(from, 1)
        ids.splice(to, 0, dragId)
        setDragId(null)
        setDropTargetId(null)
        void apiPost('/api/dsh-space/ops', { op: 'reorder-spaces', ids })
          .then(refresh)
          .catch((error: unknown) => console.warn('[dsh-space] 排序失败', error))
      }

      /** 成员行（主成员显示在前——展示倾向，不改数据顺序） */
      const memberRow = (space: RegistryPayload['spaces'][number], folder: RegistryPayload['spaces'][number]['folders'][number], displayIndex: number): ReactNode => {
        const isPrimary = (optimisticPrimary?.spaceId === space.id ? optimisticPrimary.path : space.primary) === folder.path
        const riseThis = rise?.key === `${space.id}:${folder.path}`
        return el('div', {
          key: folder.path,
          className: `dsp-member${isPrimary ? ' primary' : ''}${riseThis ? ' rise' : ''}`,
          style: riseThis ? { '--dsp-rise-from': `${rise!.from}px` } as Record<string, unknown> : undefined,
          title: folder.path,
        }, el('span', { className: 'dsp-member-name' }, folder.title ?? folder.path.split('/').pop() ?? folder.path), el('span', { className: 'dsp-badge' }, folder.mode === 'link' ? 'link' : 'ref'), isPrimary ? el('span', { className: 'dsp-primary-badge' }, '主') : null, !isPrimary ? el('button', { className: 'dsp-mini', onClick: () => setPrimaryAt(space, folder.path, displayIndex) }, '设主') : null, el('button', {
          className: 'dsp-del',
          title: '摘除（真实目录不动）',
          onClick: () => confirmDo(`从「${space.name}」摘除成员 ${folder.path}？真实目录不动。`, () => apiPost('/api/dsh-space/ops', { op: 'detach', space: space.name, target: folder.path })),
        }, '✕'))
      }

      const sessionRow = (session: SessionRow): ReactNode => {
        const dot = dotState(session)
        return el('div', { className: `dsp-row${session.id === sessionState.current ? ' current' : ''}`, key: session.id, onClick: () => open(session.id), title: `${dot.label} · ${session.cwd ?? session.id}` }, el('span', { className: `dsp-dot${dot.cls}`, title: dot.label }), el('span', { className: 'dsp-row-title' }, session.displayTitle), el('span', { className: 'dsp-row-time' }, fmtTime(session.updatedAt)))
      }

      // —— 工作区卡片 ——
      const spaceCards = registry!.spaces.map((space) => {
        const key = `s:${space.id}`
        const isCollapsed = Boolean(collapsed[key])
        const rows = buckets.spaceRows.get(space.id) ?? []
        const bindState = bindingState(space.workspaceId, space.shell, wsState)
        const badge = bindingBadge(space.workspaceId, space.shell)
        const sortedFolders = [...space.folders].sort((a, b) => {
          const pa = (optimisticPrimary?.spaceId === space.id ? optimisticPrimary.path : space.primary) === a.path ? 0 : 1
          const pb = (optimisticPrimary?.spaceId === space.id ? optimisticPrimary.path : space.primary) === b.path ? 0 : 1
          return pa - pb
        })
        return el('div', {
          key: space.id,
          className: `dsp-card${dragId === space.id ? ' dragging' : ''}${dropTargetId === space.id && dragId !== space.id ? ' drop-target' : ''}`,
        }, el('div', {
          className: 'dsp-card-head',
          draggable: true,
          onDragStart: () => setDragId(space.id),
          onDragEnd: () => {
            setDragId(null)
            setDropTargetId(null)
          },
          onDragOver: (e: { preventDefault: () => void }) => {
            e.preventDefault()
            if (dragId && dragId !== space.id)
              setDropTargetId(space.id)
          },
          onDrop: (e: { preventDefault: () => void }) => {
            e.preventDefault()
            onCardDrop(space.id)
          },
        }, el('button', { className: `dsp-chev${isCollapsed ? '' : ' open'}`, onClick: () => toggleCollapse(key), title: isCollapsed ? '展开' : '折叠' }, '▸'), el('span', { className: 'dsp-name', title: space.shell }, space.name), el('span', { className: 'dsp-count' }, rows.length > 0 ? `${rows.length}` : ''), el('span', { className: `dsp-badge${badge.warn ? ' warn' : ''}` }, badge.text), bindState === 'dangling' || bindState === 'mismatch' ? el('button', { className: 'dsp-mini dsp-repair', onClick: () => rebind({ space: space.name }) }, '修复绑定') : null, el('button', { className: 'dsp-go', disabled: bindState !== 'ready', title: bindState === 'ready' ? '从固定壳目录创建会话' : '请先修复核心绑定', onClick: () => startIn(space.workspaceId, space.shell) }, '新会话'), el('button', {
          className: 'dsp-del',
          title: '删除工作区记录（壳目录与成员文件不动）',
          onClick: () => confirmDo(`删除工作区「${space.name}」的附加记录？壳目录与成员文件不动。`, () => apiPost('/api/dsh-space/ops', { op: 'drop', space: space.name })),
        }, '✕')), !isCollapsed ? el('div', { className: 'dsp-meta' }, `${space.folders.length} 成员 · ${space.shell}`) : null, !isCollapsed && sortedFolders.length > 0 ? el('div', { className: 'dsp-members' }, sortedFolders.map((folder, i) => memberRow(space, folder, i))) : null, ...(!isCollapsed ? rows.map(sessionRow) : []))
      })

      // —— 对话区：按日期分组（可折叠）——
      const chatGroups = new Map<string, RegistryPayload['chats']>()
      for (const chat of registry!.chats) {
        const { date } = tailOf(chat.path)
        const list = chatGroups.get(date) ?? []
        list.push(chat)
        chatGroups.set(date, list)
      }
      const chatBlocks = [...chatGroups.entries()].flatMap(([date, list]) => {
        const key = `d:${date}`
        const isCollapsed = Boolean(collapsed[key])
        const dateRows = list.flatMap(chat => buckets.chatRows.get(chat.path) ?? [])
        const head = el('div', { key: `h-${date}`, className: 'dsp-date', onClick: () => toggleCollapse(key) }, el('button', { className: `dsp-chev${isCollapsed ? '' : ' open'}` }, '▸'), el('span', { className: 'dsp-date-text' }, `${date}${dateRows.length > 0 ? ` · ${dateRows.length} 会话` : ''}`))
        if (isCollapsed)
          return [head]
        return [head, ...list.map((chat) => {
          const bindState = bindingState(chat.workspaceId, chat.path, wsState)
          const badge = bindingBadge(chat.workspaceId, chat.path)
          const rows = buckets.chatRows.get(chat.path) ?? []
          return el('div', { key: chat.path, className: 'dsp-card' }, el('div', { className: 'dsp-card-head' }, el('span', { className: 'dsp-name', title: chat.path }, tailOf(chat.path).slug), el('span', { className: 'dsp-count' }, rows.length > 0 ? `${rows.length}` : ''), el('span', { className: `dsp-badge${badge.warn ? ' warn' : ''}` }, badge.text), bindState === 'dangling' || bindState === 'mismatch' ? el('button', { className: 'dsp-mini dsp-repair', onClick: () => rebind({ chat: chat.path }) }, '修复绑定') : null, el('button', { className: 'dsp-go', disabled: bindState !== 'ready', title: bindState === 'ready' ? '从对话目录创建会话' : '请先修复核心绑定', onClick: () => startIn(chat.workspaceId, chat.path) }, '开会话'), el('button', {
            className: 'dsp-del',
            title: '删除对话记录（目录不动）',
            onClick: () => confirmDo(`删除对话记录 ${chat.path}？目录与核心行不动。`, () => apiPost('/api/dsh-space/ops', { op: 'chatdrop', ref: chat.path })),
          }, '✕')), ...rows.map(sessionRow))
        })]
      })

      const miscCollapsed = Boolean(collapsed.misc)
      const createModal = form.kind === 'space'
        ? el('div', { className: 'dsp-modal-backdrop', onMouseDown: () => !form.busy && setForm({ kind: null, name: '', folder: null, link: false, busy: false }) }, el('div', {
            'className': 'dsp-modal',
            'role': 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'dsp-create-title',
            'onMouseDown': (event: { stopPropagation: () => void }) => event.stopPropagation(),
          }, el('div', { className: 'dsp-modal-head' }, el('div', { id: 'dsp-create-title', className: 'dsp-modal-title' }, '创建工作区'), el('button', { className: 'dsp-modal-close', title: '关闭', disabled: form.busy, onClick: () => setForm({ kind: null, name: '', folder: null, link: false, busy: false }) }, '×')), el('div', { className: 'dsp-field' }, el('div', { className: 'dsp-name-field' }, el('span', { 'className': 'dsp-name-icon', 'aria-hidden': true }, '▢'), el('input', {
            className: 'dsp-modal-input',
            autoFocus: true,
            placeholder: '工作区名称',
            value: form.name,
            onChange: (event: { target: { value: string } }) => setForm(prev => ({ ...prev, name: event.target.value })),
            onKeyDown: (event: { key: string, preventDefault: () => void }) => {
              if (event.key === 'Enter' && form.name.trim() && !form.busy) {
                event.preventDefault()
                submitSpace()
              }
            },
          }))), el('div', { className: 'dsp-field' }, el('div', { className: 'dsp-label' }, '源文件夹'), form.folder
            ? el('div', { className: 'dsp-source selected', title: form.folder }, el('span', { 'aria-hidden': true }, '▢'), el('span', { className: 'dsp-source-path' }, form.folder), el('button', { className: 'dsp-source-action', disabled: form.busy, onClick: () => setForm(prev => ({ ...prev, folder: null, link: false })) }, '移除'))
            : el('button', { className: 'dsp-source', disabled: form.busy, onClick: () => { void workspaces.pickDirectory().then(path => path && setForm(prev => ({ ...prev, folder: path }))) } }, el('span', { className: 'dsp-source-action' }, '添加成员文件夹'))), form.folder ? el('div', { className: 'dsp-mode-row' }, el('span', { className: 'dsp-label' }, '挂入方式'), el('div', { className: 'dsp-segment' }, el('button', { className: !form.link ? 'dsp-mode-on' : '', disabled: form.busy, onClick: () => setForm(prev => ({ ...prev, link: false })) }, '引用'), el('button', { className: form.link ? 'dsp-mode-on' : '', disabled: form.busy, onClick: () => setForm(prev => ({ ...prev, link: true })) }, '链接'))) : null, form.error ? el('div', { className: 'dsp-error' }, form.error) : null, el('div', { className: 'dsp-modal-actions' }, el('button', { className: 'dsp-modal-button', disabled: form.busy, onClick: () => setForm({ kind: null, name: '', folder: null, link: false, busy: false }) }, '取消'), el('button', { className: 'dsp-modal-button primary', disabled: form.busy || !form.name.trim(), onClick: submitSpace }, form.busy ? '创建中…' : '创建工作区'))))
        : null
      return el('div', { className: 'dsp-side' }, createModal, confirmBar, actionError ? el('div', { className: 'dsp-error' }, actionError) : null, el('div', { className: 'dsp-sec-head' }, el('span', { className: 'dsp-sec-title' }, `工作区（${registry!.spaces.length}）`), el('button', { className: 'dsp-add', onClick: () => setForm({ kind: 'space', name: '', folder: null, link: false, busy: false }) }, '+ 工作区')), ...spaceCards, registry!.spaces.length === 0 ? el('div', { className: 'dsp-note' }, '暂无工作区——用「+ 工作区」或 /space create') : null, el('div', { className: 'dsp-sec-head' }, el('span', { className: 'dsp-sec-title' }, `对话（${registry!.chats.length}）`), el('button', { className: 'dsp-add', disabled: chatState.busy, onClick: submitChat }, chatState.busy ? '创建中…' : '+ 对话')), chatState.error ? el('div', { className: 'dsp-error' }, chatState.error) : null, ...chatBlocks, wsState.phase === 'ready' && buckets.misc.length > 0
        ? el('div', { key: 'misc' }, el('div', { className: 'dsp-date', onClick: () => toggleCollapse('misc') }, el('button', { className: `dsp-chev${miscCollapsed ? '' : ' open'}` }, '▸'), el('span', { className: 'dsp-date-text' }, `未归组 · ${buckets.misc.length} 会话`)), ...(!miscCollapsed ? buckets.misc.map(sessionRow) : []))
        : null, registry!.chats.length === 0 && (wsState.phase === 'pending' || buckets.misc.length === 0) ? el('div', { className: 'dsp-note' }, wsState.phase === 'pending' ? '正在同步核心工作区…' : '暂无对话——用「+ 对话」或 /space chat') : null)
    }

    function apply(ctx: ClientContext): void {
      const slots = ctx.get('slots') as SlotsLike | undefined
      if (!slots)
        return
      // 逃生门：localStorage 一键还原官方侧边栏（紧急用；刷新生效）
      if (globalThis.localStorage?.getItem(ESCAPE_KEY) === '1') {
        console.warn('[dsh-space] 侧边栏接管已禁用（清除 localStorage 的 dsh-space.sidebar.off 后刷新恢复）')
        return
      }
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-space: sidebar styles')

      // single 插槽顶替规则：默认 priority 0 会与官方注册撞车（fail-loud），
      // 显式更低值参与选举，lowest renders——官方浏览器被我们遮蔽。
      // 订阅句柄在工厂闭包内构造一次：引用稳定，uSES 不因换引用重订阅
      slots.inject('sidebar.workspaces', () => {
        const sessions = ctx.get('sessions') as SessionsLike
        const workspaces = ctx.get('workspaces') as WorkspacesLike
        const subSessions = (cb: () => void): (() => void) => sessions.list.subscribe(cb)
        const getSessions = (): ReturnType<typeof sessions.list.getSnapshot> => sessions.list.getSnapshot()
        const subWorkspaces = (cb: () => void): (() => void) => workspaces.list.subscribe(cb)
        const getWorkspaces = (): ReturnType<typeof workspaces.list.getSnapshot> => workspaces.list.getSnapshot()
        return slots.register(
          { name: 'sidebar.workspaces', priority: -10 },
          () => SpaceSidebar({ services: { sessions, workspaces, subSessions, getSessions, subWorkspaces, getWorkspaces } }),
        )
      })
    }

    exports.apply = apply
    exports.inject = clientInject
    return module.exports
  },
})
