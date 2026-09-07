/** 仅在对应方向仍有内容时渐隐边缘，保留滚动条本身的可见性 */
export function installScrollFade(element: HTMLElement): () => void {
  const update = (): void => {
    const remaining = element.scrollHeight - element.clientHeight - element.scrollTop
    element.toggleAttribute('data-fade-top', element.scrollTop > 1)
    element.toggleAttribute('data-fade-bottom', remaining > 1)
    element.style.setProperty('--dsh-space-scrollbar-width', `${Math.max(0, element.offsetWidth - element.clientWidth)}px`)
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
  observer?.observe(element)
  if (element.firstElementChild)
    observer?.observe(element.firstElementChild)
  element.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  update()
  return () => {
    observer?.disconnect()
    element.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    element.removeAttribute('data-fade-top')
    element.removeAttribute('data-fade-bottom')
    element.style.removeProperty('--dsh-space-scrollbar-width')
  }
}
