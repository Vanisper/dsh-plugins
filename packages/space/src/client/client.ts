import type { ClientServices, RegistryPayload, SessionRow, SessionSnapshot, WorkspaceSnapshot } from './types.ts'
import { groupSessions } from './model.ts'

const css = `.dsh-space-sidebar{display:flex;flex-direction:column;gap:6px;padding:8px 6px;overflow:auto;font-size:12px}.dsh-space-toolbar{display:flex;gap:4px;justify-content:flex-end}.dsh-space-button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:inherit;padding:4px 8px;cursor:pointer}.dsh-space-button:hover{background:var(--dsw-alias-bg-layer-2)}.dsh-space-button:disabled{opacity:.45;cursor:not-allowed}.dsh-space-group{padding:4px 6px}.dsh-space-head{display:flex;align-items:center;gap:6px}.dsh-space-title{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-space-kind{font-size:10px;color:var(--dsw-alias-label-tertiary)}.dsh-space-path{color:var(--dsw-alias-label-tertiary);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-space-session{display:flex;gap:6px;width:100%;padding:4px 2px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.dsh-space-session:hover{background:var(--dsw-alias-bg-layer-2)}.dsh-space-dot{width:6px;height:6px;margin-top:4px;border-radius:50%;background:var(--dsw-alias-border-l2);flex:none}.dsh-space-dot.run{background:var(--dsw-alias-state-business-primary)}.dsh-space-empty{color:var(--dsw-alias-label-tertiary);padding:4px 2px}.dsh-space-error{color:var(--dsw-alias-state-error-primary);padding:4px}.dsh-space-dialog{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#0005}.dsh-space-form{display:flex;flex-direction:column;gap:12px;width:min(420px,calc(100vw - 32px));padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}.dsh-space-form input{min-width:0;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:inherit}.dsh-space-form-actions{display:flex;justify-content:flex-end;gap:8px}`

interface ReactLike {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown
  useState: <T>(value: T) => [T, (next: T | ((old: T) => T)) => void]
  useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => void
  useSyncExternalStore: <T>(subscribe: (fn: () => void) => () => void, snapshot: () => T) => T
}

type SessionService = ClientServices['sessions'] & {
  list: { subscribe: (fn: () => void) => () => void, getSnapshot: () => SessionSnapshot }
}
type WorkspaceService = ClientServices['workspaces'] & {
  list: { subscribe: (fn: () => void) => () => void, getSnapshot: () => WorkspaceSnapshot }
}
type SlotsService = ClientServices['slots']
interface ClientContext { get: (name: string) => unknown, effect: (fn: () => (() => void) | void, label?: string) => unknown }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/dsh-space/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json() as Record<string, unknown>
  if (!response.ok || value.ok === false)
    throw new Error(typeof value.error === 'string' ? value.error : '操作失败')
  return value
}

function Sidebar({ React, sessions, workspaces }: { React: ReactLike, sessions: SessionService, workspaces: WorkspaceService }): unknown {
  const e = React.createElement
  const [registry, setRegistry] = React.useState<RegistryPayload | undefined>(undefined)
  const [version, setVersion] = React.useState(0)
  const [dialog, setDialog] = React.useState<'space' | null>(null)
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const sessionState = React.useSyncExternalStore(fn => sessions.list.subscribe(fn), () => sessions.list.getSnapshot())
  const workspaceState = React.useSyncExternalStore(fn => workspaces.list.subscribe(fn), () => workspaces.list.getSnapshot())

  React.useEffect(() => {
    let active = true
    fetch('/api/dsh-space/registry').then(response => response.json() as Promise<RegistryPayload>).then((value) => {
      if (active && value.ok)
        setRegistry(value)
    }).catch((cause) => {
      if (active)
        setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      active = false
    }
  }, [version])

  const refresh = (): void => setVersion(value => value + 1)
  const createSpace = (): void => {
    if (!name.trim() || busy)
      return
    setBusy(true)
    setError(undefined)
    void post({ op: 'create-space', name: name.trim() }).then(() => {
      setDialog(null)
      setName('')
      refresh()
    }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setBusy(false))
  }
  const createChat = (): void => {
    if (busy)
      return
    setBusy(true)
    setError(undefined)
    void post({ op: 'create-chat' }).then(async (value) => {
      const chat = value.chat as { workspaceId?: string } | undefined
      if (!chat?.workspaceId)
        throw new Error('创建结果缺少核心工作区 ID')
      const id = chat.workspaceId
      const deadline = Date.now() + 5000
      while (!workspaces.list.getSnapshot().items.some(item => item.workspaceId === id)) {
        if (Date.now() > deadline)
          throw new Error('等待核心工作区列表更新超时')
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      workspaces.startSession(id)
      refresh()
    }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setBusy(false))
  }

  if (!registry)
    return e('div', { className: 'dsh-space-sidebar' }, error ?? '加载工作区…')
  const buckets = groupSessions(registry, sessionState, workspaceState)
  const groups = registry.items.map((item) => {
    const rows = buckets.rows.get(item.workspaceId) ?? []
    return e('section', { className: 'dsh-space-group', key: item.workspaceId }, e('div', { className: 'dsh-space-head' }, e('span', { className: 'dsh-space-title' }, item.title || item.path), e('span', { className: 'dsh-space-kind' }, item.kind)), e('div', { className: 'dsh-space-path', title: item.path }, item.path), rows.length ? rows.map((session: SessionRow) => e('button', { className: 'dsh-space-session', key: session.id, onClick: () => sessions.open(session.id) }, e('span', { className: `dsh-space-dot${session.running ? ' run' : ''}` }), e('span', null, session.displayTitle))) : e('div', { className: 'dsh-space-empty' }, '暂无会话'))
  })
  if (workspaceState.phase === 'ready' && buckets.misc.length)
    groups.push(e('section', { className: 'dsh-space-group', key: 'misc' }, e('div', { className: 'dsh-space-title' }, '未归组'), buckets.misc.map(session => e('button', { className: 'dsh-space-session', key: session.id, onClick: () => sessions.open(session.id) }, session.displayTitle))))
  const modal = dialog === 'space'
    ? e('div', { className: 'dsh-space-dialog', onMouseDown: () => !busy && setDialog(null) }, e('form', {
        className: 'dsh-space-form',
        onSubmit: (event: { preventDefault: () => void }) => {
          event.preventDefault()
          createSpace()
        },
        onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
      }, e('strong', null, '创建工作区'), e('input', { autoFocus: true, value: name, placeholder: '工作区名称', onChange: (event: { target: { value: string } }) => setName(event.target.value) }), error ? e('div', { className: 'dsh-space-error' }, error) : null, e('div', { className: 'dsh-space-form-actions' }, e('button', { type: 'button', className: 'dsh-space-button', disabled: busy, onClick: () => setDialog(null) }, '取消'), e('button', { type: 'submit', className: 'dsh-space-button', disabled: busy || !name.trim() }, busy ? '创建中…' : '创建'))))
    : null
  return e('div', { className: 'dsh-space-sidebar' }, modal, e('div', { className: 'dsh-space-toolbar' }, e('button', { className: 'dsh-space-button', disabled: busy, onClick: () => setDialog('space') }, '+ 工作区'), e('button', { className: 'dsh-space-button', disabled: busy, onClick: createChat }, '+ 对话')), error ? e('div', { className: 'dsh-space-error' }, error) : null, groups)
}

interface LoaderGlobal { __ModuleLoader__?: { load: (input: { id: string, factory: (require: (name: string) => unknown) => unknown }) => void } }
const loader = (globalThis as LoaderGlobal).__ModuleLoader__
loader?.load({
  id: 'dsh-space',
  factory: (require) => {
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react') as ReactLike
    const inject = ['slots', 'sessions', 'workspaces']
    exports.inject = inject
    exports.apply = (ctx: ClientContext): void => {
      const slots = ctx.get('slots') as SlotsService | undefined
      const sessions = ctx.get('sessions') as SessionService | undefined
      const workspaces = ctx.get('workspaces') as WorkspaceService | undefined
      if (!slots || !sessions || !workspaces)
        return
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-space sidebar styles')
      ctx.effect(() => {
        slots.inject('sidebar.workspaces', () => slots.register({ name: 'sidebar.workspaces', priority: -10 }, () => Sidebar({ React, sessions, workspaces })))
        return () => {}
      }, 'dsh-space sidebar')
    }
    return module.exports
  },
})
