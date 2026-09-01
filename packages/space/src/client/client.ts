// ============================================================
// 浏览器侧客户端束（P3 完整视图）：接管 sidebar.workspaces
// ------------------------------------------------------------
// 两段式：工作区（空间卡片 + 认领会话）｜对话（chats 实体按日期分组 +
// 未归组杂项）。会话分桶三级规则：绑定行 sessionIds（核心账目，主）→
// resolve 宽松认领（cwd 落有效路径子树的存量）→ 杂项桶。
// 入口：+ 工作区（名称 + 可选目录 + ref/link）、+ 对话（静默建目录即开会话）、
// 卡片「新会话」（id-first：startSession(绑定行 id)）。
// single 插槽顶替：显式 priority -10（lowest renders），卸载即还原官方浏览器
// ============================================================
import type { ClientContext, ReactLike, ReactNode, RegistryPayload, ResolveResult, SessionRow, SessionsLike, SlotsLike, WorkspacesLike } from './types.ts'

const CSS = `
.dsp-side{display:flex;flex-direction:column;gap:6px;padding:10px 6px;font-size:12px;color:var(--dsw-alias-label-primary);min-height:0;overflow-y:auto;}
.dsp-sec-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px;}
.dsp-sec-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em;}
.dsp-add{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:1px 8px;font-size:11px;cursor:pointer;line-height:18px;}
.dsp-add:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsp-space{display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 8px 4px;}
.dsp-space-head{display:flex;align-items:center;gap:6px;}
.dsp-space-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-badge{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;line-height:16px;white-space:nowrap;}
.dsp-go{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:1px 8px;font-size:11px;cursor:pointer;line-height:18px;}
.dsp-go:hover{background:var(--dsw-alias-bg-layer-2);}
.dsp-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);word-break:break-all;padding:2px 0;}
.dsp-row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:7px;cursor:pointer;}
.dsp-row:hover{background:var(--dsw-alias-bg-layer-2);}
.dsp-row.current{background:var(--dsw-alias-bg-layer-3);}
.dsp-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-border-l2);}
.dsp-dot.running{background:var(--dsw-alias-state-business-primary);}
.dsp-dot.pending{background:var(--dsw-alias-state-warn-primary);}
.dsp-dot.done{background:var(--dsw-alias-state-success-primary);}
.dsp-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-row-time{font-size:10px;color:var(--dsw-alias-label-secondary);flex:none;}
.dsp-date{font-size:10.5px;color:var(--dsw-alias-label-secondary);padding:4px 6px 0;}
.dsp-chat{display:flex;flex-direction:column;background:var(--dsh-alias-bg-layer-1, var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:4px 8px;}
.dsp-chat-head{display:flex;align-items:center;gap:6px;padding:2px 0;}
.dsp-chat-name{font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsp-form{display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px;}
.dsp-form-row{display:flex;gap:6px;align-items:center;}
.dsp-input{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 8px;font-size:12px;outline:none;}
.dsp-input:focus{border-color:var(--dsw-alias-brand-primary);}
.dsp-pick{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer;white-space:nowrap;}
.dsp-mode{display:flex;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary);}
.dsp-mode-on{color:var(--dsw-alias-brand-primary);font-weight:600;}
.dsp-note{padding:2px 6px;color:var(--dsw-alias-label-secondary);font-style:italic;}
.dsp-error{padding:4px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;}
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

    /** 会话行（含跳转；open 必须经闭包调用——解构成裸函数会丢 this） */
    function SessionRowItem(props: { session: SessionRow, current: boolean, open: (id: string) => void }): ReactNode {
      const { session, current, open } = props
      const dot = dotState(session)
      return React.createElement('div', { className: `dsp-row${current ? ' current' : ''}`, key: session.id, onClick: () => open(session.id), title: `${dot.label} · ${session.cwd ?? session.id}` }, React.createElement('span', { className: `dsp-dot${dot.cls}`, title: dot.label }), React.createElement('span', { className: 'dsp-row-title' }, session.displayTitle), React.createElement('span', { className: 'dsp-row-time' }, fmtTime(session.updatedAt)))
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
      const [state, setState] = React.useState<SideState>({ status: 'loading', version: 0 })
      // 宽松认领：cwd → 首个命中空间 id（仅对未被绑定行认领的会话）
      const [claimMap, setClaimMap] = React.useState<Record<string, string>>({})

      // 订阅句柄来自注册工厂闭包：引用稳定，避免每 render 重订阅的 churn
      const sessionState = React.useSyncExternalStore(props.services.subSessions, props.services.getSessions)
      const wsState = React.useSyncExternalStore(props.services.subWorkspaces, props.services.getWorkspaces)

      // 诊断（临时）：pending/completed 状态位是否真的到达列表行。
      // 若应出现琥珀/绿的场景里控制台始终没有这条日志，说明服务端的运行时
      // 管线本就不投递状态位（官方侧边栏同样看不到），问题不在我们的渲染
      const flagKey = sessionState.ids.filter((id) => {
        const row = sessionState.byId[id]
        return Boolean(row) && (row!.pendingInteraction !== undefined || row!.completed === true)
      }).join(',')
      React.useEffect(() => {
        if (!flagKey)
          return () => {}
        const detail = flagKey.split(',').map((id) => {
          const row = sessionState.byId[id]!
          return `${id}: pending=${String(row.pendingInteraction)} completed=${String(row.completed)} running=${String(row.running)}`
        }).join(' | ')
        console.warn('[dsh-space] 状态位出现：', detail)
        return () => {}
      }, [flagKey])

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

      // 创建表单状态
      const [form, setForm] = React.useState<{ kind: 'space' | 'chat' | null, name: string, folder: string | null, link: boolean, busy: boolean, error?: string }>({ kind: null, name: '', folder: null, link: false, busy: false })

      const registry = state.status === 'ready' ? state.data : undefined

      // —— 分桶（useMemo：绑定行 → 宽松认领 → 杂项）——
      const buckets = React.useMemo(() => {
        const spaces = registry?.spaces ?? []
        const chats = registry?.chats ?? []
        const rows = sessionState.ids
          .map(id => sessionState.byId[id])
          .filter((s): s is SessionRow => Boolean(s) && !s!.blank && s!.origin !== 'subagent')
        const archived = new Set(wsState.archivedSessionIds)

        const spaceRows = new Map<string, SessionRow[]>()
        for (const space of spaces) spaceRows.set(space.id, [])
        const chatRows = new Map<string, SessionRow[]>()
        for (const chat of chats) chatRows.set(chat.path, [])

        const rowBySession = new Map<string, { kind: 'space' | 'chat', key: string }>()
        for (const space of spaces) {
          const row = wsState.items.find(item => item.workspaceId === space.workspaceId)
          if (!row || !space.workspaceId)
            continue
          for (const id of row.sessionIds)
            rowBySession.set(id, { kind: 'space', key: space.id })
        }
        for (const chat of chats) {
          const row = wsState.items.find(item => item.workspaceId === chat.workspaceId)
          if (!row || !chat.workspaceId)
            continue
          for (const id of row.sessionIds) {
            if (!rowBySession.has(id))
              rowBySession.set(id, { kind: 'chat', key: chat.path })
          }
        }

        const misc: SessionRow[] = []
        const unclaimedCwds: string[] = []
        for (const row of rows) {
          if (archived.has(row.id))
            continue
          const viaBinding = rowBySession.get(row.id)
          if (viaBinding) {
            (viaBinding.kind === 'space' ? spaceRows.get(viaBinding.key) : chatRows.get(viaBinding.key))!.push(row)
            continue
          }
          if (row.cwd) {
            const claim = claimMap[row.cwd]
            if (claim && spaceRows.has(claim)) {
              spaceRows.get(claim)!.push(row)
              continue
            }
            unclaimedCwds.push(row.cwd)
          }
          misc.push(row)
        }
        for (const list of [...spaceRows.values(), ...chatRows.values()])
          list.sort((a, b) => b.updatedAt - a.updatedAt)
        misc.sort((a, b) => b.updatedAt - a.updatedAt)
        return { spaceRows, chatRows, misc, unclaimedCwds: [...new Set(unclaimedCwds)] }
      }, [registry, sessionState, wsState, claimMap])

      // 未认领 cwd 集合变化时批量 resolve；认领 map 合并语义——只覆写本次
      // 实际解析的路径，保留其余旧认领。整体替换会造成振荡：被认领的 cwd
      // 不再进未认领集合 → 下次解析集合变小 → 空结果把旧认领抹掉 → 又回到
      // 未认领 → /resolve 无限往返、列表反复重算闪动
      const claimKey = buckets.unclaimedCwds.join('\n')
      React.useEffect(() => {
        if (!claimKey)
          return () => {}
        const paths = claimKey.split('\n')
        let alive = true
        apiPost('/api/dsh-space/resolve', { paths })
          .then((data) => {
            if (!alive)
              return
            const results = (data.results as ResolveResult[] | undefined) ?? []
            setClaimMap((prev) => {
              // 合并语义：只覆写本次实际解析的路径，其余旧认领原样保留
              const next = { ...prev }
              for (const item of results) {
                if (item.spaceIds.length > 0)
                  next[item.input] = item.spaceIds[0]!
                else
                  delete next[item.input]
              }
              return next
            })
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [claimKey])

      const el = (tag: string, attrs: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode => React.createElement(tag, attrs, ...children)
      const open = (id: string): void => sessions.open(id)

      /**
           新会话入口（id-first + 按需治愈）：绑定行在列表中→直接开；
          列表已加载却查无此行→悬空，POST rebind 幂等重建后用新 id 开
       */
      const startIn = (boundId: string | undefined, rebindArg: Record<string, unknown>): void => {
        if (!boundId)
          return
        const known = wsState.items.length === 0 || wsState.items.some(item => item.workspaceId === boundId)
        if (known) {
          workspaces.startSession(boundId)
          return
        }
        void apiPost('/api/dsh-space/ops', { op: 'rebind', ...rebindArg })
          .then((result) => {
            const workspaceId = (result as { workspaceId?: string }).workspaceId
            if (workspaceId)
              workspaces.startSession(workspaceId)
            setState(prev => ({ ...prev, version: prev.version + 1 }))
          })
          .catch((error: unknown) => console.warn('[dsh-space] rebind 失败', error))
      }

      if (state.status === 'loading')
        return el('div', { className: 'dsp-side' }, '加载 dsh-space 注册表…')
      if (state.status === 'error')
        return el('div', { className: 'dsp-side' }, `dsh-space 数据面异常：${state.error ?? '未知'}`)

      const refresh = (): void => setState(prev => ({ ...prev, version: prev.version + 1 }))
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
          if (!form.folder) {
            await apiPost('/api/dsh-space/ops', { op: 'create-space', name })
            return
          }
          if (form.link) {
            // link 首成员：先建空间再显式 attach（create-space 的 folder 参数固定 reference）
            const created = await apiPost('/api/dsh-space/ops', { op: 'create-space', name }) as { space: { name: string } }
            await apiPost('/api/dsh-space/ops', { op: 'attach', space: created.space.name, target: form.folder, mode: 'link' })
            return
          }
          await apiPost('/api/dsh-space/ops', { op: 'create-space', name, folder: form.folder })
        })
      }
      const submitChat = (): void => {
        const name = form.name.trim()
        if (form.busy)
          return
        void runOp(async () => {
          const created = await apiPost('/api/dsh-space/ops', { op: 'chat', name: name || undefined }) as { chat: { workspaceId?: string } }
          if (created.chat.workspaceId)
            workspaces.startSession(created.chat.workspaceId)
        })
      }

      const spaceCards = registry!.spaces.map(space => el('div', { key: space.id, className: 'dsp-space' }, el('div', { className: 'dsp-space-head' }, el('span', { className: 'dsp-space-name' }, space.name), el('span', { className: 'dsp-badge' }, space.workspaceId ? '已绑定' : '未绑定'), space.workspaceId
        ? el('button', { className: 'dsp-go', onClick: () => startIn(space.workspaceId, { space: space.name }) }, '新会话')
        : null), el('div', { className: 'dsp-meta' }, `${space.folders.length} 成员 · ${space.effectivePath ?? '无有效路径'}`), ...(buckets.spaceRows.get(space.id) ?? []).map(session => SessionRowItem({ session, current: session.id === sessionState.current, open }))))

      // 对话按日期分组
      const chatGroups = new Map<string, RegistryPayload['chats']>()
      for (const chat of registry!.chats) {
        const { date } = tailOf(chat.path)
        const list = chatGroups.get(date) ?? []
        list.push(chat)
        chatGroups.set(date, list)
      }
      const chatBlocks = [...chatGroups.entries()].flatMap(([date, list]) => [
        el('div', { key: `d-${date}`, className: 'dsp-date' }, date),
        ...list.map(chat => el('div', { key: chat.path, className: 'dsp-chat' }, el('div', { className: 'dsp-chat-head' }, el('span', { className: 'dsp-chat-name' }, tailOf(chat.path).slug), el('span', { className: 'dsp-badge' }, chat.workspaceId ? '' : '未绑定'), chat.workspaceId
          ? el('button', { className: 'dsp-go', onClick: () => startIn(chat.workspaceId, { chat: chat.path }) }, '开会话')
          : null), ...(buckets.chatRows.get(chat.path) ?? []).map(session => SessionRowItem({ session, current: session.id === sessionState.current, open })))),
      ])

      return el('div', { className: 'dsp-side' }, el('div', { className: 'dsp-sec-head' }, el('span', { className: 'dsp-sec-title' }, `工作区（${registry!.spaces.length}）`), el('button', { className: 'dsp-add', onClick: () => setForm({ kind: form.kind === 'space' ? null : 'space', name: '', folder: null, link: false, busy: false }) }, '+ 工作区')), form.kind === 'space'
        ? el('div', { className: 'dsp-form' }, el('div', { className: 'dsp-form-row' }, el('input', { className: 'dsp-input', placeholder: '空间名称（同时是壳目录名）', value: form.name, onChange: (e: { target: { value: string } }) => setForm(prev => ({ ...prev, name: e.target.value })) })), el('div', { className: 'dsp-form-row' }, el('input', { className: 'dsp-input', readOnly: true, placeholder: form.folder ?? '（可选）选择首个成员目录', value: form.folder ?? '' }), el('button', { className: 'dsp-pick', onClick: () => { void workspaces.pickDirectory().then(p => p && setForm(prev => ({ ...prev, folder: p }))) } }, '选择…')), el('div', { className: 'dsp-form-row' }, el('span', { className: 'dsp-mode' }, '挂入方式：'), el('button', { className: `dsp-pick${!form.link ? ' dsp-mode-on' : ''}`, onClick: () => setForm(prev => ({ ...prev, link: false })) }, 'ref 引用'), el('button', { className: `dsp-pick${form.link ? ' dsp-mode-on' : ''}`, onClick: () => setForm(prev => ({ ...prev, link: true })) }, 'link 链接')), form.error ? el('div', { className: 'dsp-error' }, form.error) : null, el('div', { className: 'dsp-form-row' }, el('button', { className: 'dsp-go', disabled: form.busy || !form.name.trim(), onClick: submitSpace }, form.busy ? '创建中…' : '创建'), el('button', { className: 'dsp-add', onClick: () => setForm({ kind: null, name: '', folder: null, link: false, busy: false }) }, '取消')))
        : null, ...spaceCards, registry!.spaces.length === 0 ? el('div', { className: 'dsp-note' }, '暂无空间——用「+ 工作区」或 /space create') : null, el('div', { className: 'dsp-sec-head' }, el('span', { className: 'dsp-sec-title' }, `对话（${registry!.chats.length}）`), el('button', { className: 'dsp-add', onClick: () => setForm({ kind: form.kind === 'chat' ? null : 'chat', name: '', folder: null, link: false, busy: false }) }, '+ 对话')), form.kind === 'chat'
        ? el('div', { className: 'dsp-form' }, el('div', { className: 'dsp-form-row' }, el('input', { className: 'dsp-input', placeholder: '对话名（可空，缺省 new-chat）', value: form.name, onChange: (e: { target: { value: string } }) => setForm(prev => ({ ...prev, name: e.target.value })) }), el('button', { className: 'dsp-go', disabled: form.busy, onClick: submitChat }, form.busy ? '创建中…' : '创建并开会话')), form.error ? el('div', { className: 'dsp-error' }, form.error) : null)
        : null, ...chatBlocks, buckets.misc.length > 0
        ? el('div', null, el('div', { className: 'dsp-date' }, '未归组'), ...buckets.misc.map(session => SessionRowItem({ session, current: session.id === sessionState.current, open })))
        : null, registry!.chats.length === 0 && buckets.misc.length === 0 ? el('div', { className: 'dsp-note' }, '暂无对话——用「+ 对话」或 /space chat') : null)
    }

    function apply(ctx: ClientContext): void {
      const slots = ctx.get('slots') as SlotsLike | undefined
      if (!slots)
        return
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
