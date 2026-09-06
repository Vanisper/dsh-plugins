import type { DraftHostConversation, DraftHostSessions } from './draft-host.ts'
import type { ReactLike, SlotsService, WorkspaceService } from './types.ts'
import { createDraftComposer } from './draft-host.ts'
import { draftCss } from './draft-styles.ts'
import { createModeControl, createModeStore, installSidebarMode } from './mode.ts'
import { assertNativeCompatibility } from './native-compat.ts'
import { createSidebar } from './sidebar.ts'
import { sidebarCss } from './styles.ts'
import { createHostWorkspacePicker } from './target-picker.ts'

interface ClientContext {
  get: (name: string) => unknown
  effect: (fn: () => (() => void) | void, label?: string) => unknown
}

interface LoaderGlobal {
  __ModuleLoader__?: { load: (input: { id: string, factory: (require: (name: string) => unknown) => unknown }) => void }
  __DSH_BOOT__?: unknown
}

const loader = (globalThis as LoaderGlobal).__ModuleLoader__
loader?.load({
  id: 'dsh-space',
  factory: (require) => {
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react') as ReactLike
    exports.inject = ['slots', 'sessions', 'workspaces', 'conversation']
    exports.apply = (ctx: ClientContext): void => {
      const slots = ctx.get('slots') as SlotsService | undefined
      const sessions = ctx.get('sessions') as DraftHostSessions | undefined
      const workspaces = ctx.get('workspaces') as WorkspaceService | undefined
      const conversation = ctx.get('conversation') as DraftHostConversation | undefined
      if (!slots || !sessions || !workspaces || !conversation)
        return

      const incompatible = (cause: unknown): void => {
        const message = cause instanceof Error ? cause.message : String(cause)
        slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-space-compatibility' }, () =>
          React.createElement('div', { role: 'status', title: message, style: { padding: 8, fontSize: 12 } }, '空间模式需更新兼容适配；当前使用官方模式')))
      }
      try {
        assertNativeCompatibility((globalThis as LoaderGlobal).__DSH_BOOT__)
      }
      catch (cause) {
        incompatible(cause)
        return
      }
      const mode = createModeStore()
      try {
        const composer = createDraftComposer(React, require, ctx, slots, sessions, workspaces, conversation)
        const WorkspacePicker = createHostWorkspacePicker(React, workspaces)
        const Sidebar = createSidebar(React, sessions, workspaces, mode, composer.draft.begin)
        const ModeControl = createModeControl(React, mode)
        ctx.effect(() => {
          const disposers: Array<() => void> = []
          const dispose = (): void => disposers.reverse().forEach(off => off())
          try {
            disposers.push(composer.install(mode, WorkspacePicker))
            disposers.push(mode.listen())
            disposers.push(installSidebarMode(slots, mode, Sidebar, sidebarCss + draftCss))
            disposers.push(slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-space-mode' }, ModeControl)))
            return dispose
          }
          catch (cause) {
            dispose()
            throw cause
          }
        }, 'dsh-space client')
      }
      catch (cause) {
        incompatible(cause)
      }
    }
    return module.exports
  },
})
