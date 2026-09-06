import type { ModeStore } from './mode.ts'
import type { Preparation } from './preparation.ts'
import type { HostWorkspacePickerProps } from './target-picker.ts'
import type { ConversationService, ReactLike, SessionService, SlotsService, WorkspaceService } from './types.ts'
import { runOperation } from './api.ts'
import { createPreparation } from './preparation.ts'
import { waitFor } from './wait.ts'

/** 目录分配和输入交接均使用已有宿主身份，不写会话文件或复制输入状态机 */
export function createHostPreparation(
  sessions: SessionService,
  workspaces: WorkspaceService,
  conversation: ConversationService,
): Preparation {
  return createPreparation({
    async allocate(creationId) {
      const result = await runOperation({ op: 'create-chat', creationId }, AbortSignal.timeout(15000))
      const id = (result.chat as { workspaceId?: string } | undefined)?.workspaceId
      if (!id)
        throw new Error('创建结果缺少核心工作区 ID，请检查对话目录管理')
      return id
    },
    async connect(id) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let expired = false
      try {
        return await Promise.race([
          (async () => {
            await workspaces.refresh()
            if (expired)
              throw new Error('连接工作区已超时')
            await waitFor(() => workspaces.list.getSnapshot().items.find(item => item.workspaceId === id), () => true)
            if (expired)
              throw new Error('连接工作区已超时')
            return workspaces.connectWorkspace(id)
          })(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              expired = true
              reject(new Error('连接工作区超时，草稿已保留。请重试，不会重复创建对话目录。'))
            }, 15000)
          }),
        ])
      }
      finally {
        clearTimeout(timer)
      }
    },
    open: id => sessions.open(id),
    transfer(id, draft, submit) {
      const snapshot = sessions.list.getSnapshot()
      if (snapshot.current !== id)
        throw new Error('当前会话已切换，草稿尚未发送')
      if (!snapshot.byId[id]?.blank)
        throw new Error('目标会话已开始，未追加本页草稿。请返回原输入区检查。')
      const scope = sessions.scope(id)
      if (!scope)
        throw new Error('会话暂不可用，请重试')
      const input = conversation.input.for(scope)
      const current = input.state.getSnapshot()
      if (current.phase !== 'plain')
        throw new Error('目标输入区正在处理操作，请稍后重试')
      if (draft && (current.draft || current.imageIds.length))
        throw new Error('目标会话已有未发送内容。请先返回原输入区处理，本页草稿已保留。')
      if (draft)
        input.setDraft(draft)
      if (!submit)
        return
      const block = conversation.blocks.storeFor(id).getSnapshot()
      if (block) {
        input.notify('info', `${block.reason}；草稿已保留，请完成配置后发送`)
        return
      }
      // 交接完成后的拒绝由官方输入区保留草稿，不能在准备页重复发起
      try {
        input.submit()
      }
      catch (cause) {
        input.notify('error', cause instanceof Error ? cause.message : String(cause))
      }
    },
  })
}

/** 临时接管准备视图；交接期间用原生输入区的挂载作为就绪信号 */
export function installPreparation(
  React: ReactLike,
  slots: SlotsService,
  sessions: SessionService,
  mode: ModeStore,
  preparation: Preparation,
  View: () => unknown,
  Picker: (props: HostWorkspacePickerProps) => unknown,
): () => void {
  let disposeView: (() => void) | undefined
  let disposeDock: (() => void) | undefined
  let disposePicker: (() => void) | undefined
  let handoffTimer: ReturnType<typeof setTimeout> | undefined
  let handoffId: string | undefined
  let current = sessions.list.getSnapshot().current
  let disposed = false
  const e = React.createElement
  function Handoff({ sessionId }: { sessionId: string }): unknown {
    const state = React.useSyncExternalStore(preparation.subscribe, preparation.getSnapshot)
    React.useEffect(() => {
      // 官方会话组件先恢复其持久化草稿，再检查是否可以接收新内容
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled)
          preparation.deliver(sessionId)
      })
      return () => {
        cancelled = true
      }
    }, [sessionId, state.phase])
    if (state.phase === 'handoff')
      return e('div', { className: 'dsh-space-handoff', role: 'status' }, '正在接入输入区…')
    if (!state.active && (state.draft || state.workspaceId))
      return e('button', { type: 'button', className: 'dsh-space-resume', onClick: preparation.resume }, '返回待发送草稿')
    return null
  }
  const sync = (): void => {
    if (disposed)
      return
    const state = preparation.getSnapshot()
    const enabled = mode.getSnapshot().mode === 'space'
    if (enabled && state.active && state.phase !== 'handoff') {
      disposeView ??= slots.register({ name: 'conversation', priority: -10 }, View)
    }
    else {
      disposeView?.()
      disposeView = undefined
    }
    if (enabled) {
      disposeDock ??= slots.register({ name: 'conversation.input.dock', id: 'dsh-space-handoff', order: -100 }, Handoff)
      disposePicker ??= slots.register({ name: 'conversation.hero.workspace', priority: -10 }, Picker)
    }
    else {
      disposeDock?.()
      disposeDock = undefined
      disposePicker?.()
      disposePicker = undefined
      if (state.active)
        preparation.suspend()
    }
    const nextId = state.phase === 'handoff' ? state.sessionId : undefined
    if (nextId !== handoffId) {
      clearTimeout(handoffTimer)
      handoffId = nextId
      if (nextId)
        handoffTimer = setTimeout(() => preparation.failHandoff('官方输入区未就绪，草稿尚未发送。请重试或返回原输入区。'), 8000)
    }
    mode.setBlocked(state.phase !== 'editing', 'preparation')
  }
  const offSlots = slots.inject('conversation.input.dock', () => {
    sync()
    const offState = preparation.subscribe(sync)
    const offMode = mode.subscribe(sync)
    return () => {
      offState()
      offMode()
      clearTimeout(handoffTimer)
      handoffId = undefined
      disposeView?.()
      disposeView = undefined
      disposeDock?.()
      disposeDock = undefined
      disposePicker?.()
      disposePicker = undefined
      preparation.failHandoff('官方输入区已卸载，草稿尚未发送')
      preparation.suspend()
      mode.setBlocked(false, 'preparation')
    }
  })
  const offSessions = sessions.list.subscribe(() => {
    const next = sessions.list.getSnapshot().current
    if (current === next)
      return
    current = next
    const state = preparation.getSnapshot()
    if (state.phase !== 'handoff' || state.sessionId !== next)
      preparation.suspend()
  })
  const unload = (event: BeforeUnloadEvent): void => {
    if (preparation.getSnapshot().draft || preparation.getSnapshot().phase !== 'editing') {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', unload)
  return () => {
    disposed = true
    clearTimeout(handoffTimer)
    offSessions()
    offSlots()
    preparation.dispose()
    mode.setBlocked(false, 'preparation')
    window.removeEventListener('beforeunload', unload)
  }
}
