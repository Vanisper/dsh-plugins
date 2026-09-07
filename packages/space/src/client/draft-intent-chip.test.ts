// @vitest-environment jsdom
import type { ReactLike } from './types.ts'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { createDraftIntentChip, draftPlaceholders } from './draft-intent-chip.ts'

describe('草稿意图标记', () => {
  it('模式标记包含独立图标与取消图标；锁定时不接受操作，普通消息不显示', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const element = document.createElement('div')
    const root = createRoot(element)
    const Chip = createDraftIntentChip(React as unknown as ReactLike) as React.ComponentType<{ intent: 'message' | 'plan' | 'goal', locked: boolean, onCancel: () => void }>
    const onCancel = vi.fn()
    try {
      for (const intent of ['plan', 'goal'] as const) {
        await React.act(() => root.render(React.createElement(Chip, { intent, locked: false, onCancel })))
        const button = element.querySelector('button')!
        expect(button.textContent).toBe(intent === 'plan' ? '计划' : '目标')
        expect(button.title).toBe(intent === 'plan' ? '退出计划模式' : '取消目标模式')
        expect(button.getAttribute('aria-label')).toBe(button.title)
        expect(button.getAttribute('aria-pressed')).toBe('true')
        expect(button.querySelectorAll('svg')).toHaveLength(2)
        await React.act(() => button.click())
      }
      expect(onCancel).toHaveBeenCalledTimes(2)
      await React.act(() => root.render(React.createElement(Chip, { intent: 'goal', locked: true, onCancel })))
      element.querySelector('button')!.click()
      expect(onCancel).toHaveBeenCalledTimes(2)
      await React.act(() => root.render(React.createElement(Chip, { intent: 'message', locked: false, onCancel })))
      expect(element.childElementCount).toBe(0)
    }
    finally {
      await React.act(() => root.unmount())
      vi.unstubAllGlobals()
    }
  })

  it('普通、计划和目标分别提供当前输入目的的提示', () => {
    expect(draftPlaceholders).toEqual({
      message: '有什么需要一起完成？',
      plan: '描述需要规划的任务…',
      goal: '描述目标和预期成果…',
    })
  })
})
