import type { DraftIntent } from './draft-intent.ts'
import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

export const draftPlaceholders: Record<DraftIntent, string> = {
  message: '有什么需要一起完成？',
  plan: '描述需要规划的任务…',
  goal: '描述目标和预期成果…',
}

export function createDraftIntentChip(React: ReactLike): (props: { intent: DraftIntent, locked: boolean, onCancel: () => void }) => unknown {
  const e = React.createElement
  const { Icon } = createControls(React)
  return function DraftIntentChip({ intent, locked, onCancel }) {
    if (intent === 'message')
      return null
    const goal = intent === 'goal'
    const action = goal ? '取消目标模式' : '退出计划模式'
    return e('span', { className: 'dsh-space-draft-intent-wrap' }, e('button', {
      'type': 'button',
      'className': 'dsh-space-draft-intent',
      'title': action,
      'aria-label': action,
      'aria-pressed': true,
      'disabled': locked,
      'onClick': onCancel,
    }, e('span', { 'className': 'dsh-space-draft-intent-symbol', 'aria-hidden': true }, e('span', { className: 'dsh-space-draft-intent-kind' }, e(Icon, { name: intent, size: 16 })), e('span', { className: 'dsh-space-draft-intent-cancel' }, e(Icon, { name: 'cancel', size: 16 }))), goal ? '目标' : '计划'))
  }
}
