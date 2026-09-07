import type { DraftSession } from './draft-session.ts'
import type { ModeStore } from './mode.ts'
import type { NativeEntry, NativeInput } from './native-compat.ts'
import type { HostWorkspacePickerProps } from './target-picker.ts'
import type { ConversationService, ReactLike, SessionService, SlotsService, WorkspaceService } from './types.ts'
import { runOperation } from './api.ts'
import { createControls } from './controls.ts'
import { createDraftMenu } from './draft-menu.ts'
import { createDraftOptions } from './draft-options.ts'
import { createDraftSession } from './draft-session.ts'
import { createNativeComposer, extendNativeEntry, extendNewSession, pauseInitialSelection, selectSnapshot, useNativeSnapshot } from './native-compat.ts'
import { waitFor } from './wait.ts'

export interface DraftHostSessions extends SessionService {
  clear: () => void
  refresh: () => Promise<void>
  create: (input: { workspaceId: string, sessionId: string }) => Promise<string>
}

export interface DraftHostConversation extends ConversationService {
  input: ConversationService['input'] & { for: (scope: unknown) => NativeInput }
  createDraftImages: (files: readonly File[]) => Array<{ id: string }>
  draftImages: (ids: readonly string[]) => unknown[]
  releaseDraftImage: (id: string) => void
}

export interface DraftComposer {
  draft: DraftSession
  input: NativeInput
  install: (mode: ModeStore, Picker: (props: HostWorkspacePickerProps) => unknown) => () => void
}

/** 无实体输入与真实输入的交付，身份始终由宿主创建 */
export function createDraftComposer(
  React: ReactLike,
  require: (name: string) => unknown,
  ctx: unknown,
  slots: SlotsService,
  sessions: DraftHostSessions,
  workspaces: WorkspaceService,
  conversation: DraftHostConversation,
): DraftComposer {
  const { Shell, Root } = createNativeComposer(require)
  const options = createDraftOptions()
  const { IconButton } = createControls(React)
  const DraftMenu = createDraftMenu(React)
  let adopting: string | undefined
  let transferredImages: readonly string[] = []
  let disposed = false
  const draft = createDraftSession({
    clearSelection: () => sessions.clear(),
    async allocate(creationId) {
      const result = await runOperation({ op: 'create-chat', creationId }, AbortSignal.timeout(15000))
      const id = (result.chat as { workspaceId?: string } | undefined)?.workspaceId
      if (!id)
        throw new Error('创建结果缺少核心工作区身份')
      return id
    },
    async create(workspaceId, sessionId) {
      await workspaces.refresh()
      await sessions.refresh()
      if (sessions.list.getSnapshot().byId[sessionId]) {
        const owner = workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(sessionId))
        if (owner?.workspaceId !== workspaceId)
          throw new Error('创建身份对应的工作区不一致，未复用会话')
        return sessionId
      }
      return sessions.create({ workspaceId, sessionId })
    },
    async adopt(sessionId, payload) {
      const summary = sessions.list.getSnapshot().byId[sessionId]
      if (!summary?.blank || summary.running)
        throw new Error('目标会话已经开始，当前草稿已保留，未重复发送')
      const scope = sessions.scope(sessionId)
      if (!scope)
        throw new Error('会话已创建但输入区未就绪，请重试')
      const target = conversation.input.for(scope) as NativeInput
      const state = target.state.getSnapshot()
      if (state.phase !== 'plain' || state.draft || state.imageIds.length)
        throw new Error('目标会话已有输入，当前草稿已保留，未覆盖或追加')
      if (!target.addImages(payload.imageIds))
        throw new Error('目标输入区暂不能接收附件')
      transferredImages = payload.imageIds
      target.setDraft(payload.text)
      adopting = sessionId
      sessions.open(sessionId)
      try {
        await waitFor(() => {
          const binding = sessions.binding(sessionId) as unknown as { session: { getSnapshot: () => { openState: string } } } | undefined
          return binding?.session.getSnapshot()
        }, value => value.openState === 'open')
        if (disposed || sessions.list.getSnapshot().current !== sessionId)
          return
        const config = options.explicit()
        const context = ctx as { get: (name: string) => any }
        if (config.selection)
          await context.get('modelDirectories').directoryFor(sessionId).select(config.selection)
        const session = sessions.binding(sessionId)?.session as unknown as { command: (line: string) => Promise<{ ok: boolean, value?: { matched: boolean }, error?: { message: string } }> }
        for (const line of [config.permission ? `/permission ${config.permission}` : undefined, config.plan ? '/plan' : undefined]) {
          if (!line)
            continue
          const result = await session.command(line)
          if (!result.ok || !result.value?.matched)
            throw new Error(result.error?.message ?? `无法应用新会话选项：${line}`)
        }
        if (disposed || sessions.list.getSnapshot().current !== sessionId)
          return
        const block = conversation.blocks.storeFor(sessionId).getSnapshot()
        if (block) {
          target.notify('info', `${block.reason}；内容已保留`)
          return
        }
        target.submit()
      }
      catch (cause) {
        target.notify('error', cause instanceof Error ? cause.message : String(cause))
      }
      finally {
        adopting = undefined
      }
    },
  })
  const input = new Shell({
    actx: ctx,
    async defaultSink(text: string, imageIds: readonly string[], _mode: unknown, signal: AbortSignal) {
      await draft.submit({ text, imageIds }, signal)
      return { kind: 'success' }
    },
    commandImages: {
      serialize: async () => [],
      release: () => {},
      unsupportedNotice: () => '会话创建后可使用此命令',
    },
  })
  const e = React.createElement
  const begin = draft.begin
  draft.begin = (targetId) => {
    if (draft.getSnapshot().phase === 'created') {
      input.notices.set(null)
      options.reset()
    }
    begin(targetId)
  }

  function DraftActions(): unknown {
    const state = React.useSyncExternalStore(draft.subscribe, draft.getSnapshot)
    const content = React.useSyncExternalStore(input.state.subscribe, input.state.getSnapshot)
    const [confirm, setConfirm] = React.useState(false)
    if (!content.draft && !content.imageIds.length && !state.creationId)
      return null
    return confirm
      ? e('span', { className: 'dsh-space-draft-actions' }, e('button', {
          type: 'button',
          className: 'dsh-space-button',
          disabled: state.phase === 'creating',
          onClick: () => {
            if (!draft.discard())
              return
            const ids = [...input.snapshot.imageIds]
            input.commitSend(ids)
            input.notices.set(null)
            ids.forEach(id => conversation.releaseDraftImage(id))
            options.reset()
            setConfirm(false)
          },
        }, '丢弃草稿'), e(IconButton, { icon: 'close', label: '保留草稿', onClick: () => setConfirm(false) }))
      : e(IconButton, { icon: 'remove', label: '丢弃草稿（不删除已创建的会话）', disabled: state.phase === 'creating', onClick: () => setConfirm(true) })
  }

  return {
    draft,
    input,
    install(mode, Picker) {
      const disposers: Array<() => void> = []
      let undo: (() => void) | undefined
      const sync = (): void => {
        if (mode.getSnapshot().mode === 'official') {
          undo?.()
          undo = undefined
          draft.suspend()
          return
        }
        if (undo)
          return
        const parts: Array<() => void> = []
        try {
          parts.push(pauseInitialSelection(ctx, require, workspaces))
          parts.push(extendNativeEntry(slots, 'conversation', () => function DraftRoot(props) {
            const state = React.useSyncExternalStore(draft.subscribe, draft.getSnapshot)
            const ws = React.useSyncExternalStore(workspaces.list.subscribe, workspaces.list.getSnapshot)
            const target = ws.items.find(item => item.workspaceId === state.targetId)
            return e(Root, {
              ...props,
              draftMode: props.sessionId === undefined,
              draftTarget: props.sessionId === undefined ? { title: target?.title ?? (state.targetId ? ws.phase === 'ready' ? '工作区不可用' : '正在读取工作区…' : '独立对话'), workspaceId: target?.workspaceId } : undefined,
              selectWorkspace: props.sessionId === undefined
                ? async (id: string) => draft.setTarget(id)
                : props.selectWorkspace,
              renderSlot: (key: string, owner: Record<string, unknown>) => {
                const native = props.renderSlot(key, owner)
                return props.sessionId === undefined && key === 'conversation.hero.agentPreset'
                  ? e('span', { className: 'dsh-space-draft-actions' }, native, e(DraftActions, {}))
                  : native
              },
            })
          }))
          parts.push(extendNativeEntry(slots, 'conversation.composer.bar', NativeBar => function DraftBar(props) {
            const originalInput = props.useInput((s: unknown) => s)
            const originalNotices = props.useNotices((s: unknown) => s)
            const originalLexicon = props.useLexicon((s: unknown) => s)
            const originalMenu = props.useMenuLauncher((s: unknown) => s)
            const localInput = useNativeSnapshot(React, input.state)
            const localNotices = useNativeSnapshot(React, input.notices)
            const localLexicon = useNativeSnapshot(React, input.lexicon)
            const settings = React.useSyncExternalStore(options.subscribe, options.getSnapshot)
            React.useSyncExternalStore(draft.subscribe, draft.getSnapshot)
            const fileInput = React.useRef<HTMLInputElement | null>(null)
            const [menuOpen, setMenuOpen] = React.useState(false)
            const isDraft = props.sessionId === undefined
            const busy = input.snapshot.phase === 'submitting' || input.snapshot.phase === 'adjudicating'
            const showMenu = isDraft && !busy && menuOpen
            React.useEffect(() => {
              if (!isDraft || busy)
                setMenuOpen(false)
            }, [isDraft, busy])
            const addImages = (files: readonly File[]): string | null => {
              try {
                const images = conversation.createDraftImages(files)
                if (!input.addImages(images.map(image => image.id)))
                  images.forEach(image => conversation.releaseDraftImage(image.id))
                return null
              }
              catch (cause) {
                return cause instanceof Error ? cause.message : String(cause)
              }
            }
            const registry = slots as SlotsService & { entries: (key: string) => NativeEntry[] }
            const model = registry.entries('conversation.input.model').find(entry => (entry.options.priority ?? 0) === 0)
            return e('div', { style: { display: 'contents' } }, e('input', {
              type: 'file',
              hidden: true,
              multiple: true,
              accept: 'image/png,image/jpeg,image/webp,image/gif',
              ref: fileInput,
              onChange: (event: { target: HTMLInputElement }) => {
                const error = addImages(Array.from(event.target.files ?? []))
                event.target.value = ''
                if (error)
                  input.notify('error', error)
              },
            }), e(NativeBar, {
              ...props,
              useInput: selectSnapshot(isDraft ? localInput : originalInput),
              useNotices: selectSnapshot(isDraft ? localNotices : originalNotices),
              useLexicon: selectSnapshot(isDraft ? localLexicon : originalLexicon),
              useMenuLauncher: selectSnapshot(isDraft ? showMenu ? 'command' : null : originalMenu),
              ...(!isDraft && adopting === props.sessionId ? { disabled: true, blocked: { reason: '正在应用新会话选项…' } } : {}),
              ...(isDraft
                ? {
                    inputActions: input.actions,
                    keyboard: input,
                    disabled: busy,
                    placeholder: '有什么需要一起完成？',
                    toggleCommandMenu: () => setMenuOpen(open => !open),
                    overlay: e(DraftMenu, { open: showMenu, onClose: () => setMenuOpen(false), onAddImages: () => fileInput.current?.click() }),
                    command: options.command,
                    useProjection: (key: string, selector?: (value: unknown) => unknown) => {
                      const original = props.useProjection(key, selector)
                      const value = key === 'permissions' ? settings.permissions : key === 'plan' ? { active: options.plan, pending: false } : undefined
                      return value === undefined ? original : selector ? selector(value) : value
                    },
                    renderSlot: (key: string, owner: Record<string, unknown>) => {
                      if (key === 'conversation.input.model' && model) {
                        const locale = (ctx as { get: (name: string) => any }).get('locale')
                        return e(model.component, { ...owner, locked: busy, available: true, directory: options, load: options.load, select: options.select, t: locale.bind('model') })
                      }
                      if (key === 'conversation.input.plan') {
                        return e('button', {
                          'type': 'button',
                          'className': 'dsh-space-draft-plan',
                          'role': 'switch',
                          'aria-checked': options.plan,
                          'aria-label': '规划模式',
                          'title': '规划模式',
                          'disabled': busy,
                          'onClick': () => options.setPlan(!options.plan),
                        }, 'Plan')
                      }
                      return props.renderSlot(key, owner)
                    },
                    draftImages: (ids: readonly string[]) => conversation.draftImages(ids),
                    addImages,
                    removeImage: (id: string) => {
                      if (input.snapshot.phase !== 'plain')
                        return
                      input.removeImage(id)
                      conversation.releaseDraftImage(id)
                    },
                  }
                : {}),
            }))
          }))
          parts.push(slots.inject('conversation.hero.workspace', () => slots.register<HostWorkspacePickerProps>(
            { name: 'conversation.hero.workspace', priority: -10 },
            props => e(Picker, {
              ...props,
              independent: sessions.list.getSnapshot().current === undefined,
              onIndependent: () => {
                draft.setTarget()
                props.onClose()
              },
              disabled: sessions.list.getSnapshot().current === undefined && Boolean(draft.getSnapshot().creationId),
            }),
          )))
          parts.push(extendNewSession(workspaces, id => draft.begin(id)))
          undo = () => parts.reverse().forEach(off => off())
          if (sessions.list.getSnapshot().current === undefined)
            draft.begin(draft.getSnapshot().targetId)
        }
        catch (cause) {
          parts.reverse().forEach(off => off())
          throw cause
        }
      }
      const unload = (event: BeforeUnloadEvent): void => {
        if (input.snapshot.draft || input.snapshot.imageIds.length || draft.getSnapshot().phase === 'creating') {
          event.preventDefault()
          event.returnValue = ''
        }
      }
      disposers.push(sessions.list.subscribe(() => {
        const current = sessions.list.getSnapshot().current
        if (current !== undefined && current !== adopting)
          draft.suspend()
        else if (current === undefined && mode.getSnapshot().mode === 'space' && !draft.getSnapshot().active)
          draft.begin(draft.getSnapshot().targetId)
      }))
      disposers.push(draft.subscribe(() => {
        mode.setBlocked(draft.getSnapshot().phase === 'creating', 'draft')
        const error = draft.getSnapshot().error
        if (error)
          input.notify('error', error)
      }))
      disposers.push(mode.subscribe(sync))
      window.addEventListener('beforeunload', unload)
      const dispose = (): void => {
        if (disposed)
          return
        disposed = true
        disposers.reverse().forEach(off => off())
        undo?.()
        window.removeEventListener('beforeunload', unload)
        draft.dispose()
        // 已交付附件由真实输入区负责，卸载不能释放另一输入区仍在使用的资源
        input.snapshot.imageIds.filter(id => !transferredImages.includes(id)).forEach(id => conversation.releaseDraftImage(id))
        input.dispose()
        options.dispose()
        mode.setBlocked(false, 'draft')
      }
      try {
        sync()
        void options.load()
      }
      catch (cause) {
        dispose()
        throw cause
      }
      return dispose
    },
  }
}
