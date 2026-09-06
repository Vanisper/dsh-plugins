import type { ReactLike, SessionService, SlotsService, WorkspaceService } from './types.ts'
import { createModeControl, createModeStore, installSidebarMode } from './mode.ts'
import { createSidebar } from './sidebar.ts'
import { sidebarCss } from './styles.ts'

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

      const mode = createModeStore()
      const Sidebar = createSidebar(React, sessions, workspaces, mode)
      const ModeControl = createModeControl(React, mode)
      ctx.effect(() => mode.listen(), 'dsh-space display preference')
      ctx.effect(() => installSidebarMode(slots, mode, Sidebar, sidebarCss), 'dsh-space sidebar mode')
      slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-space-mode' }, ModeControl))
    }
    return module.exports
  },
})
