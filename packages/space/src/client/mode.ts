import type { ReactLike, SlotProps, SlotsService } from './types.ts'
import { createControls } from './controls.ts'

export type SidebarMode = 'space' | 'official'
const MODE_KEY = 'dsh-space.sidebar.mode'

export interface ModeStore {
  getSnapshot: () => { mode: SidebarMode, blocked: boolean }
  subscribe: (listener: () => void) => () => void
  setMode: (mode: SidebarMode) => void
  setBlocked: (blocked: boolean, owner?: string) => void
  listen: () => () => void
}

function readMode(): SidebarMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'official' ? 'official' : 'space'
  }
  catch {
    return 'space'
  }
}

/** 展示偏好独立于领域数据；弹窗与提交期间延后其他页面的切换 */
export function createModeStore(): ModeStore {
  let snapshot = { mode: readMode(), blocked: false }
  let pending: SidebarMode | undefined
  const listeners = new Set<() => void>()
  const blockers = new Set<string>()
  const publish = (): void => listeners.forEach(listener => listener())
  const change = (mode: SidebarMode): void => {
    if (snapshot.blocked) {
      pending = mode
      return
    }
    if (mode === snapshot.mode)
      return
    snapshot = { ...snapshot, mode }
    publish()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setMode(mode: SidebarMode): void {
      change(mode)
      try {
        localStorage.setItem(MODE_KEY, mode)
      }
      catch {
        /* 存储受限时保留当前页面偏好 */
      }
    },
    setBlocked(blocked: boolean, owner = 'sidebar'): void {
      if (blocked)
        blockers.add(owner)
      else
        blockers.delete(owner)
      const nextBlocked = blockers.size > 0
      if (snapshot.blocked === nextBlocked)
        return
      snapshot = { ...snapshot, blocked: nextBlocked }
      publish()
      if (!nextBlocked && pending) {
        const next = pending
        pending = undefined
        change(next)
      }
    },
    listen(): () => void {
      const sync = (event: StorageEvent): void => {
        if (event.key === MODE_KEY || event.key === null)
          change(readMode())
      }
      window.addEventListener('storage', sync)
      return () => window.removeEventListener('storage', sync)
    },
  }
}

/** 只在空间模式持有增强注册和样式，官方模式由宿主重新选举 */
export function installSidebarMode(
  slots: SlotsService,
  mode: ModeStore,
  Sidebar: (props: SlotProps) => unknown,
  css: string,
): () => void {
  return slots.inject('sidebar.workspaces', () => {
    let dispose: (() => void) | undefined
    const sync = (): void => {
      if (mode.getSnapshot().mode === 'official') {
        dispose?.()
        dispose = undefined
      }
      else if (!dispose) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-space'
        style.textContent = css
        document.head.append(style)
        try {
          const unregister = slots.register(
            { name: 'sidebar.workspaces', priority: -10 },
            Sidebar,
          )
          dispose = () => {
            unregister()
            style.remove()
          }
        }
        catch (error) {
          style.remove()
          throw error
        }
      }
    }
    sync()
    const unsubscribe = mode.subscribe(sync)
    return () => {
      unsubscribe()
      dispose?.()
    }
  })
}

export function createModeControl(
  React: ReactLike,
  mode: ModeStore,
): (props: SlotProps) => unknown {
  const e = React.createElement
  const { Icon } = createControls(React)
  return function ModeControl({ wide = true }: SlotProps): unknown {
    const state = React.useSyncExternalStore(mode.subscribe, mode.getSnapshot)
    const choices: SidebarMode[] = wide
      ? ['official', 'space']
      : [state.mode === 'space' ? 'official' : 'space']
    return e(
      'div',
      {
        style: {
          display: 'flex',
          flex: wide ? 1 : undefined,
          minWidth: 0,
          boxSizing: 'border-box',
          padding: wide ? '6px 2px' : '4px',
          justifyContent: 'center',
        },
      },
      e('div', {
        'role': 'group',
        'aria-label': '侧栏模式',
        'style': {
          display: 'flex',
          gap: 2,
          padding: 2,
          width: wide ? '100%' : undefined,
          boxSizing: 'border-box',
          borderRadius: 6,
          background: wide ? 'var(--dsw-alias-interactive-bg-hover, #8882)' : 'transparent',
        },
      }, ...choices.map(value =>
        e(
          'button',
          {
            'type': 'button',
            'key': value,
            'aria-pressed': state.mode === value,
            'aria-label': `切换到${value === 'official' ? '官方' : '空间'}模式`,
            'title': state.blocked
              ? '请先完成或关闭当前操作'
              : `切换到${value === 'official' ? '官方' : '空间'}模式`,
            'disabled': state.blocked,
            'onClick': () => mode.setMode(value),
            'style': {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              flex: wide ? 1 : undefined,
              minWidth: 0,
              height: 28,
              width: wide ? undefined : 28,
              padding: wide ? '0 8px' : 0,
              border: 0,
              borderRadius: 4,
              background:
                state.mode === value
                  ? 'var(--dsw-alias-bg-layer-1, #fff)'
                  : 'transparent',
              boxShadow: state.mode === value ? '0 1px 3px #00000012' : 'none',
              color: state.mode === value ? 'var(--dsw-alias-label-primary, #242424)' : 'var(--dsw-alias-label-secondary, inherit)',
              font: 'inherit',
              fontSize: 12,
              cursor: state.blocked ? 'not-allowed' : 'pointer',
              opacity: state.blocked ? 0.5 : 1,
            },
          },
          e(Icon, { name: value === 'official' ? 'folder' : 'layers', size: 14 }),
          wide ? value === 'official' ? '官方' : '空间' : null,
        ),
      )),
    )
  }
}
