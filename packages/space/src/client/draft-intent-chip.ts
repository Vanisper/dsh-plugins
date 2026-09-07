import type { DraftIntent } from './draft-intent.ts'
import type { ReactLike } from './types.ts'
import { createControls } from './controls.ts'

export function createDraftIntentChip(React: ReactLike): (props: { intent: DraftIntent, locked: boolean, onCancel: () => void }) => unknown {
  const e = React.createElement
  const { Icon } = createControls(React)
  return function DraftIntentChip({ intent, locked, onCancel }) {
    if (intent === 'message')
      return null
    const goal = intent === 'goal'
    return e('button', {
      'type': 'button',
      'className': 'dsh-space-draft-intent',
      'title': goal ? '明确目标' : '创建计划',
      'aria-label': goal ? '目标已选中，点击取消' : 'Plan 已选中，点击取消',
      'disabled': locked,
      'onClick': onCancel,
    }, goal ? '目标' : 'Plan', e(Icon, { name: 'close', size: 12 }))
  }
}
