// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-session-owner.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _sessionOwnerRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const projects = ['plain', 'space'].map(kind => before.items.find(item => item.kind === kind && item.sessionIds.length)).filter(Boolean)
  if (!projects.length)
    throw new Error('隔离实例需要至少一个带附属会话的项目')
  const key = 'dsh-space.sidebar.layout'
  const previous = await page.evaluate(key => localStorage.getItem(key), key)
  const viewport = page.viewportSize()
  const results = []
  const setView = async (view) => {
    await page.keyboard.press('Escape')
    await page.mouse.move(0, 0)
    await page.evaluate(({ key, view, projects }) => {
      localStorage.setItem(key, JSON.stringify({
        pins: [],
        sections: ['pinned', 'workspaces', 'chats', 'misc'],
        collapsed: ['chats'],
        view,
        sorts: {},
        orders: {},
        foldedLists: [],
        groups: [{ id: 'qa-owner', title: '归属验收', color: 'blue', collapsed: false }],
        assignments: Object.fromEntries(projects.map(item => [item.sessionIds[0], 'qa-owner'])),
      }))
      window.dispatchEvent(new StorageEvent('storage', { key }))
    }, { key, view, projects })
  }
  try {
    for (const [width, height] of [[1280, 900], [320, 568]]) {
      await page.setViewportSize({ width, height })
      if (width < 700)
        await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
      for (const view of ['workspaces', 'groups']) {
        await setView(view)
        for (const item of projects) {
          await page.keyboard.press('Escape')
          const row = page.locator(`[data-session-id="${item.sessionIds[0]}"] .dsh-space-session-main`)
          await row.hover()
          const panel = page.getByRole('dialog', { name: '会话信息', exact: true })
          const owner = panel.locator('.dsh-space-detail-workspace')
          await owner.waitFor({ state: 'visible' })
          if (await owner.textContent() !== `所属工作区：${item.title}`
            || await owner.evaluate(el => el.matches('button,a,[role="button"],[tabindex]'))
            || await panel.locator('.dsh-space-detail-path').count()) {
            throw new Error(`${view} ${item.kind} 仍有项目跳转按钮或归属错误`)
          }
          await owner.click()
          if (!await panel.isVisible() || await page.getByRole('dialog', { name: '工作区信息', exact: true }).count())
            throw new Error('点击静态归属不应切换或关闭会话浮层')
          const layout = await owner.evaluate((el) => {
            const panel = el.closest('.dsh-space-details')
            const rect = panel.getBoundingClientRect()
            const style = getComputedStyle(el)
            return { width: rect.width, left: rect.left, right: rect.right, font: style.fontSize, gap: style.gap, ownerHeight: el.offsetHeight, ownerWidth: el.offsetWidth, background: style.backgroundColor, overflow: el.scrollWidth > el.clientWidth || panel.scrollWidth > panel.clientWidth, screen: innerWidth }
          })
          if (layout.left < 0 || layout.right > layout.screen || layout.overflow || layout.font !== '12px' || layout.ownerHeight !== 20 || layout.background !== 'rgba(0, 0, 0, 0)')
            throw new Error(`归属排版异常：${JSON.stringify(layout)}`)
          results.push({ viewportWidth: width, view, kind: item.kind, ...layout })
          await page.screenshot({ path: `output/playwright/session-owner-${view}-${item.kind}-${width}.png` })
        }
      }
    }
    const owner = page.locator('.dsh-space-detail-workspace')
    await owner.evaluate((el) => {
      el.lastElementChild.append('一个仅用于浏览器排版验收的完整长名称-with-an-unbroken-project-name')
    })
    if (!await owner.evaluate(el => el.offsetHeight > 20 && el.scrollWidth <= el.clientWidth && el.closest('.dsh-space-details').scrollWidth <= el.closest('.dsh-space-details').clientWidth))
      throw new Error('长名称未完整换行或产生溢出')
    await page.screenshot({ path: 'output/playwright/session-owner-long-320.png' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await setView('workspaces')
    await page.locator('.dsh-space-heading').filter({ hasText: projects[0].title }).hover()
    await page.getByRole('dialog', { name: '工作区信息', exact: true }).waitFor({ state: 'visible' })
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('悬停验收不应修改工作区或会话')
    return { cases: results, longNameWrapped: true, projectHoverRetained: true, registryUnchanged: true }
  }
  finally {
    await page.keyboard.press('Escape')
    await page.evaluate(({ key, previous }) => {
      if (previous === null)
        localStorage.removeItem(key)
      else
        localStorage.setItem(key, previous)
      window.dispatchEvent(new StorageEvent('storage', { key }))
    }, { key, previous })
    if (viewport)
      await page.setViewportSize(viewport)
  }
}
