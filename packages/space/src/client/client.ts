import type { ReactLike, SessionService, SlotsService, WorkspaceService } from './types.ts'
import { createSidebar, sidebarCss } from './sidebar.ts'

interface ClientContext {
  get: (name: string) => unknown
  effect: (fn: () => (() => void) | void, label?: string) => unknown
}

interface LoaderGlobal {
  __ModuleLoader__?: { load: (input: { id: string, factory: (require: (name: string) => unknown) => unknown }) => void }
}

const loader = (globalThis as LoaderGlobal).__ModuleLoader__
loader?.load({
  id: 'dsh-space',
  factory: (require) => {
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react') as ReactLike
    exports.inject = ['slots', 'sessions', 'workspaces']
    exports.apply = (ctx: ClientContext): void => {
      const slots = ctx.get('slots') as SlotsService | undefined
      const sessions = ctx.get('sessions') as SessionService | undefined
      const workspaces = ctx.get('workspaces') as WorkspaceService | undefined
      if (!slots || !sessions || !workspaces)
        return

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-space'
        style.textContent = sidebarCss
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-space sidebar styles')

      const Sidebar = createSidebar(React, sessions, workspaces)
      slots.inject('sidebar.workspaces', () => slots.register({
        name: 'sidebar.workspaces',
        priority: -10,
      }, Sidebar))
    }
    return module.exports
  },
})
