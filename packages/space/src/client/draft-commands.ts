import type { PopupSelectController, SelectOption, TokenSegment } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ArbitrateKey, ArbitrateOutcome, InputTriggerCandidate, MenuEvent, MenuState, TokenSpan, TriggerGuard, TriggerHit } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { DraftCommand, DraftModelSelection } from '../shared/draft-options.ts'
import type { DraftOptionStore } from './draft-options.ts'
import type { NativeCommandUI, NativeInput } from './native-compat.ts'
import type { ObservableSnapshot } from './types.ts'

export interface DraftCommands {
  menu: ObservableSnapshot<MenuState>
  launcher: ObservableSnapshot<string | null>
  lexicon: ObservableSnapshot<Map<string, never>>
  popup: PopupSelectController<void>
  pick: (source: string, index: number) => void
  close: () => void
  dismiss: () => void
  toggle: () => void
  track: (text: string, caret: number, guard: TriggerGuard, draftRev: number) => void
  arbitrate: (key: ArbitrateKey, composing: boolean) => ArbitrateOutcome
  onSpace: () => boolean
  adjudicate: () => Promise<undefined>
  dispose: () => void
}

interface Candidate extends InputTriggerCandidate {
  disabledReason?: string
}

function store<T>(value: T): ObservableSnapshot<T> & { set: (value: T) => void } {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: T) {
      if (next === value)
        return
      value = next
      listeners.forEach(listener => listener())
    },
  }
}

/** 原生命令视图的无 Session 适配；目录只读，配置只写草稿，发送才创建实体 */
export function createDraftCommands(
  native: NativeCommandUI,
  options: DraftOptionStore,
  input: NativeInput,
  clientCommands: () => DraftCommand[],
  focus: () => void,
): DraftCommands {
  const menu = store<MenuState>(native.closed)
  const launcher = store<string | null>(null)
  const lexicon = store(new Map<string, never>())
  const popup = new native.Popup({
    consume: segment => input.consumeToken(segment.via === 'menu' ? { kind: 'span', span: segment.span } : { kind: 'bare-token', token: segment.token }),
    focusComposer: focus,
  })
  let disposed = false
  let submitting = false
  let lifecycle = 0
  let hit: TriggerHit | null = null
  const reduce = (event: MenuEvent): void => menu.set(native.reduce(menu.getSnapshot(), event))
  const editable = (): boolean => !disposed && input.snapshot.phase === 'plain'
  const notify = (text: string): void => input.notify('info', text)
  const dismiss = (): void => {
    hit = null
    launcher.set(null)
    reduce({ type: 'close' })
  }
  const close = (): void => {
    lifecycle++
    dismiss()
    popup.dismiss()
  }
  const catalog = (): Candidate[] => {
    const state = options.getSnapshot()
    if (state.status === 'error' || state.commandError || !state.commands)
      throw new Error(state.error ?? state.commandError ?? '命令目录尚未就绪')
    const client = clientCommands()
    const names = new Set(state.commands.map(item => item.name))
    if (client.some(item => names.has(item.name)))
      throw new Error('宿主与前端命令重名，无法安全选择命令')
    return [...state.commands, ...client].map((item) => {
      const supported = item.name === 'model' ? client.includes(item) : ['goal', 'plan', 'permission'].includes(item.name)
      const disabledReason = supported ? undefined : '此命令尚未适配草稿，请在创建会话后使用'
      return { ...item, disabledReason }
    })
  }
  const available = (name: string): void => {
    const item = catalog().find(item => item.name === name)
    if (!item || item.disabledReason)
      throw new Error(item?.disabledReason ?? `草稿态暂不支持 /${name}`)
  }
  const refresh = (): void => {
    const current = menu.getSnapshot()
    if (!current.open || !hit)
      return
    let items: Candidate[]
    try {
      items = native.filter(catalog(), hit.query)
    }
    catch (cause) {
      items = [{ name: '重试命令目录', description: cause instanceof Error ? cause.message : String(cause) }]
    }
    reduce({ type: 'source-settled', source: 'command', generation: current.generation, items })
  }
  const open = (next: TriggerHit, launched: boolean): void => {
    const refreshDirectory = !menu.getSnapshot().open || launched || options.getSnapshot().status === 'loading'
    popup.dismiss()
    hit = next
    launcher.set(launched ? 'command' : null)
    menu.set(native.seed(menu.getSnapshot(), [{ name: 'command', showGroupTitle: true }]))
    reduce({ type: 'hit', hit })
    if (refreshDirectory) {
      void options.load().then(() => {
        if (!disposed)
          refresh()
      })
    }
    else {
      refresh()
    }
  }
  const segmentValid = (segment: TokenSegment): boolean => editable() && (segment.via === 'menu' ? input.snapshot.draftRev === segment.span.draftRev : input.snapshot.draft.trim() === segment.token)
  const openOptions = (name: string, segment: TokenSegment): void => {
    dismiss()
    const selections = new Map<string, DraftModelSelection>()
    popup.open(name, {
      async options(_context, signal) {
        await options.load()
        if (signal.aborted)
          return []
        available(name)
        const state = options.getSnapshot()
        if (name === 'permission')
          return state.permissions ? native.permissions(state.permissions) : []
        const rows: SelectOption[] = []
        selections.clear()
        for (const group of state.groups) {
          for (const model of group.models) {
            for (const effort of model.reasoning?.efforts.length ? model.reasoning.efforts : [undefined]) {
              const selection = { provider: group.id, model: model.id, ...(effort ? { reasoningEffort: effort.id } : {}) }
              const id = JSON.stringify(selection)
              selections.set(id, selection)
              rows.push({ id, label: `${model.name}${effort ? ` · ${effort.name}` : ''}`, detail: group.name, active: state.current?.provider === group.id && state.current.model === model.id && (state.current.reasoningEffort ?? model.reasoning?.defaultEffort) === effort?.id })
            }
          }
        }
        if (!rows.length && state.failures.length)
          throw new Error(state.failures.map(item => `${item.name}: ${item.error}`).join('\n'))
        return rows
      },
      async onSelect(row) {
        if (!segmentValid(segment))
          throw new Error('草稿已变化，请重新选择命令')
        available(name)
        if (name === 'permission') {
          if (!await options.command(`/permission ${row.id}`))
            throw new Error('权限选项已失效，请重新选择')
        }
        else {
          const selection = selections.get(row.id)
          if (!selection)
            throw new Error('模型选项已失效，请重新选择')
          await options.select(selection)
        }
      },
    }, undefined, segment)
  }
  const pick = (_source: string, index: number): void => {
    const current = menu.getSnapshot()
    const item = current.groups[0]?.items[index] as Candidate | undefined
    if (!editable() || !current.open || !item || !hit || input.snapshot.draftRev !== hit.span.draftRev)
      return
    if (item.disabledReason) {
      notify(item.disabledReason)
      return
    }
    if (item.name === '重试命令目录') {
      open(hit, launcher.getSnapshot() !== null)
      return
    }
    try {
      available(item.name)
      const span = hit.span
      if (item.name === 'goal') {
        dismiss()
        if (!/^\s*\/goal(?:\s|$)/u.test(input.snapshot.draft))
          input.insertText('/goal ', span)
        focus()
      }
      else if (item.name === 'plan') {
        dismiss()
        if (input.consumeToken({ kind: 'span', span }))
          options.setPlan(true)
        focus()
      }
      else {
        openOptions(item.name, { via: 'menu', span })
      }
    }
    catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const originalSubmit = input.submit.bind(input)
  const submit = (mode?: unknown): void => {
    if (!editable() || submitting)
      return
    const snapshot = input.snapshot
    const line = snapshot.draft.trim()
    const command = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line)
    if (!command) {
      close()
      originalSubmit(mode)
      return
    }
    submitting = true
    close()
    const turn = lifecycle
    void (async () => {
      try {
        await options.load()
        if (!editable() || turn !== lifecycle || snapshot.draftRev !== input.snapshot.draftRev)
          return
        const name = command[1]!
        const args = line.slice(command[0].length).trim()
        available(name)
        if (name === 'goal') {
          if (!args)
            throw new Error('请在 /goal 后填写目标；发送时才会创建会话并启动目标')
          if (/^(?:clear|pause|resume)$|^edit(?:\s|$)/iu.test(args))
            throw new Error('草稿中尚无目标可修改，请直接填写新目标')
          originalSubmit(mode)
          return
        }
        if (name === 'plan') {
          if (!args || args === 'off') {
            if (input.consumeToken({ kind: 'span', span: { start: 0, end: snapshot.draft.length, draftRev: snapshot.draftRev } }))
              options.setPlan(args !== 'off')
            focus()
          }
          else {
            originalSubmit(mode)
          }
          return
        }
        if (!args) {
          openOptions(name, { via: 'enter', token: line })
          return
        }
        if (name === 'permission' && args === 'danger-full-access') {
          openOptions(name, { via: 'enter', token: line })
          popup.setSearch('Full access')
          return
        }
        if (name === 'permission' && await options.command(line)) {
          input.consumeToken({ kind: 'span', span: { start: 0, end: snapshot.draft.length, draftRev: snapshot.draftRev } })
          return
        }
        throw new Error(`请通过 /${name} 的选项菜单设置，内容已保留`)
      }
      catch (cause) {
        if (!disposed)
          notify(cause instanceof Error ? cause.message : String(cause))
      }
      finally {
        submitting = false
      }
    })()
  }
  input.submit = submit
  return {
    menu,
    launcher,
    lexicon,
    popup,
    pick,
    close,
    dismiss,
    toggle() {
      if (!editable())
        return
      if (launcher.getSnapshot()) {
        dismiss()
        return
      }
      const snapshot = input.snapshot
      // 加号配置不消费正文；只有输入触发的菜单携带待消费的命令 span
      const span: TokenSpan = { start: 0, end: 0, draftRev: snapshot.draftRev }
      open({ trigger: '/', query: '', position: 'leading', quoted: false, span }, true)
      focus()
    },
    track(text: string, caret: number, guard: TriggerGuard, draftRev: number) {
      const detected = native.detect(text, caret, guard)
      if (!editable() || detected?.trigger !== '/' || detected.position !== 'leading') {
        dismiss()
        return
      }
      const next = { ...detected, span: { ...detected.span, draftRev } }
      if (hit?.query === next.query && hit.span.draftRev === draftRev && menu.getSnapshot().open && !launcher.getSnapshot())
        return
      open(next, false)
    },
    arbitrate(key: ArbitrateKey, composing: boolean): ArbitrateOutcome {
      if (composing || !menu.getSnapshot().open)
        return 'pass'
      if (key === 'up' || key === 'down') {
        reduce({ type: 'move', dir: key === 'up' ? -1 : 1 })
      }
      else if (key === 'escape') {
        dismiss()
      }
      else if (key === 'enter') {
        const highlight = menu.getSnapshot().highlight
        if (highlight)
          pick(highlight.source, highlight.index)
      }
      return 'consumed'
    },
    onSpace: () => false,
    adjudicate: async () => undefined,
    dispose() {
      disposed = true
      close()
      popup.dispose()
      if (input.submit === submit)
        input.submit = originalSubmit
    },
  }
}
