import type { RegistryPayload } from './types.ts'
import { fetchRegistry } from './api.ts'

/** 可见页面定期读取附加描述；重新聚焦时立即同步，释放时取消全部请求 */
export function observeRegistry(
  receive: (value: RegistryPayload | undefined, error?: string) => void,
): () => void {
  let disposed = false
  let current: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const refresh = (): void => {
    clearTimeout(timer)
    current?.abort()
    current = undefined
    if (disposed || document.visibilityState === 'hidden')
      return
    const request = new AbortController()
    current = request
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      request.abort()
    }, 5000)
    void fetchRegistry(request.signal).then((value) => {
      if (!disposed && current === request && !request.signal.aborted)
        receive(value)
    }).catch((error: unknown) => {
      if (!disposed && current === request && (!request.signal.aborted || timedOut))
        receive(undefined, timedOut ? '读取附加描述超时' : error instanceof Error ? error.message : String(error))
    }).finally(() => {
      clearTimeout(timeout)
      if (!disposed && current === request) {
        current = undefined
        timer = setTimeout(refresh, 3000)
      }
    })
  }

  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  refresh()
  return () => {
    disposed = true
    clearTimeout(timer)
    current?.abort()
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  }
}
