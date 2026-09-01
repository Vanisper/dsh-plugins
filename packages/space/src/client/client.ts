// ============================================================
// 浏览器侧客户端束（P2 骨架）：最小接管 sidebar.workspaces
// ------------------------------------------------------------
// single 插槽的冲突语义对插件有利：动态注册条目优先级高于内置条目，
// 注册即顶替官方 WorkspaceBrowser，插件卸载即还原。
// 本阶段只验证顶替机制与数据面连通：拉取 registry 渲染朴素列表，
// 不做交互（会话跳转、创建入口、卡片排版都属 P3）。
// 实现全部收在 factory 闭包内——require 只存在于装载协议的参数里
// ============================================================
import type { ClientContext, ReactLike, ReactNode, RegistryPayload, SlotsLike } from './types.ts'

const CSS = `
.dsp-side{display:flex;flex-direction:column;gap:4px;padding:10px 8px;font-size:12px;color:var(--dsw-alias-label-primary);}
.dsp-side-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em;padding:0 6px 4px;}
.dsp-space{display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;}
.dsp-space-name{font-weight:600;}
.dsp-space-meta{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;}
.dsp-chat{padding:2px 6px;color:var(--dsw-alias-label-secondary);word-break:break-all;}
.dsp-note{padding:2px 6px;color:var(--dsw-alias-label-secondary);font-style:italic;}
`

interface SideState {
  status: 'loading' | 'ready' | 'error'
  data?: RegistryPayload
  error?: string
}

interface ModuleLoaderGlobal {
  __ModuleLoader__?: { load: (module: { id: string, factory: (require: (id: string) => unknown) => unknown }) => void }
}

const clientInject = ['slots']

;(globalThis as ModuleLoaderGlobal).__ModuleLoader__?.load({
  id: 'dsh-space',
  factory: (require) => {
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react') as ReactLike

    function SpaceSidebar(_props: unknown): ReactNode {
      const [state, setState] = React.useState<SideState>({ status: 'loading' })
      React.useEffect(() => {
        let alive = true
        fetch('/api/dsh-space/registry')
          .then(res => res.json() as Promise<RegistryPayload>)
          .then((data) => {
            if (!alive)
              return
            setState(data && data.ok
              ? { status: 'ready', data }
              : { status: 'error', error: data?.error ?? 'registry 返回异常' })
          })
          .catch((error: unknown) => {
            if (alive)
              setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
          })
        return () => {
          alive = false
        }
      }, [])

      if (state.status === 'loading')
        return React.createElement('div', { className: 'dsp-side' }, '加载 dsh-space 注册表…')
      if (state.status === 'error')
        return React.createElement('div', { className: 'dsp-side' }, `dsh-space 数据面异常：${state.error ?? '未知'}`)

      const { spaces, chats } = state.data!
      const el = (tag: string, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode => React.createElement(tag, props, ...children)
      return el('div', { className: 'dsp-side' }, el('div', { className: 'dsp-side-title' }, `工作区（${spaces.length}）`), ...spaces.map(space => el('div', { key: space.id, className: 'dsp-space' }, el('div', { className: 'dsp-space-name' }, space.name), el('div', { className: 'dsp-space-meta' }, `${space.workspaceId ? '已绑定' : '未绑定'} · ${space.folders.length} 成员`), space.effectivePath ? el('div', { className: 'dsp-space-meta' }, space.effectivePath) : null)), spaces.length === 0 ? el('div', { className: 'dsp-note' }, '暂无空间（/space create）') : null, el('div', { className: 'dsp-side-title' }, `对话（${chats.length}）`), ...chats.map(chat => el('div', { key: chat.path, className: 'dsp-chat' }, chat.path)), chats.length === 0 ? el('div', { className: 'dsp-note' }, '暂无对话（/space chat）') : null)
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

      slots.inject('sidebar.workspaces', () => slots.register(
        { name: 'sidebar.workspaces' },
        SpaceSidebar,
      ))
    }

    exports.apply = apply
    exports.inject = clientInject
    return module.exports
  },
})
