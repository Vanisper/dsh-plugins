import type { FocusTrap } from 'focus-trap'
import { createFocusTrap } from 'focus-trap'
import { withoutFocusHint } from './controls.ts'
import { nativePickerActive, subscribeNativePicker } from './native-picker.ts'

interface ModalEntry {
  element: HTMLElement
  returnTo: HTMLElement | undefined
  tabIndex: string | null
}

const MODALS = 'dialog.dsh-space-dialog[open], [role="dialog"][aria-modal="true"]'

/** 为当前空间模式内的模态层补齐焦点循环，卸载时恢复宿主行为 */
export function installModalFocus(): () => void {
  let entries: ModalEntry[] = []
  let trap: FocusTrap | undefined
  let syncing = false
  const syncSuspension = (): void => {
    if (nativePickerActive())
      trap?.pause()
    else
      withoutFocusHint(() => trap?.active ? trap.unpause() : trap?.activate())
  }
  const history: HTMLElement[] = []
  if (document.activeElement instanceof HTMLElement)
    history.push(document.activeElement)

  const restoreTabIndex = ({ element, tabIndex }: ModalEntry): void => {
    if (tabIndex === null)
      element.removeAttribute('tabindex')
    else
      element.setAttribute('tabindex', tabIndex)
  }
  const sync = (): void => {
    if (syncing)
      return
    syncing = true
    try {
      const visible = [...document.querySelectorAll<HTMLElement>(MODALS)]
        .filter(element => !element.closest('[hidden]') && element.getClientRects().length > 0)
      const previous = entries.at(-1)
      const removed = entries.filter(entry => !visible.includes(entry.element))
      entries = entries.filter(entry => visible.includes(entry.element))
      for (const element of visible) {
        if (entries.some(entry => entry.element === element))
          continue
        entries.push({
          element,
          returnTo: [...history].reverse().find(node => node.isConnected && node !== document.body && !element.contains(node)),
          tabIndex: element.getAttribute('tabindex'),
        })
        // 所有按钮在提交期间禁用时，焦点仍需有一个安全的落点
        if (!element.hasAttribute('tabindex'))
          element.tabIndex = -1
      }
      const current = entries.at(-1)
      removed.forEach(restoreTabIndex)
      if (previous === current)
        return
      trap?.deactivate()
      trap = undefined
      withoutFocusHint(() => {
        const returnTo = [...removed].reverse().map(entry => entry.returnTo).find(node => node?.isConnected && (!current || current.element.contains(node)))
        if (previous && removed.includes(previous))
          returnTo?.focus({ preventScroll: true })
        if (!current)
          return
        const element = current.element
        trap = createFocusTrap(element, {
          fallbackFocus: element,
          delayInitialFocus: false,
          returnFocusOnDeactivate: false,
          preventScroll: true,
          // 关闭、组字和忙碌保护仍交给各弹窗自身处理
          escapeDeactivates: false,
          allowOutsideClick: (event) => {
            const target = event.target
            const portal = element.parentElement
            return target instanceof HTMLElement
              && portal?.getAttribute('role') === 'presentation'
              && portal.contains(target)
              && !target.closest('[role="dialog"]')
          },
        })
        syncSuspension()
      })
    }
    finally {
      syncing = false
    }
  }
  const trackFocus = (event: FocusEvent): void => {
    if (nativePickerActive())
      return
    // React 的 autoFocus 早于 MutationObserver，先识别新模态层再让旧边界处理事件
    sync()
    const target = event.target
    if (target instanceof HTMLElement && target !== document.body && (!entries.length || entries.at(-1)!.element.contains(target))) {
      history.push(target)
      if (history.length > 20)
        history.shift()
    }
  }
  const observer = new MutationObserver(sync)
  const unsubscribePicker = subscribeNativePicker(syncSuspension)
  document.addEventListener('focusin', trackFocus, true)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'hidden'] })
  sync()
  return () => {
    observer.disconnect()
    unsubscribePicker()
    document.removeEventListener('focusin', trackFocus, true)
    trap?.deactivate()
    entries.forEach(restoreTabIndex)
    entries = []
    trap = undefined
  }
}
