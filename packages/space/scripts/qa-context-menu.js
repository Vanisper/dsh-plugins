// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-context-menu.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _contextMenuRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const key = 'dsh-space.sidebar.layout'
  const previous = await page.evaluate(key => localStorage.getItem(key), key)
  const projects = before.items.filter(item => item.kind === 'space' && item.sessionIds.length)
  const viewport = page.viewportSize()
  const fixture = { pins: [], sections: ['pinned', 'workspaces', 'chats', 'misc'], collapsed: ['chats'], view: 'workspaces', sorts: {}, orders: {}, groups: [], assignments: {}, foldedLists: [] }
  const assertMenu = async (label) => {
    await page.waitForFunction(label => document.querySelector(`.dsh-space-menu-panel[aria-label="${label}"]`)?.matches(':popover-open'), label)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const state = await page.evaluate(label => ({
      open: document.querySelector(`.dsh-space-menu-panel[aria-label="${label}"]`)?.matches(':popover-open'),
      expanded: document.querySelector(`.dsh-space-menu-trigger[aria-label="${label}"]`)?.getAttribute('aria-expanded'),
      menus: document.querySelectorAll('.dsh-space-menu-panel:popover-open').length,
      shields: document.querySelectorAll('.dsh-space-menu-backdrop').length,
    }), label)
    if (!state.open || state.expanded !== 'true' || state.menus !== 1 || state.shields !== 1)
      throw new Error(`右键松开后菜单不稳定：${JSON.stringify(state)}`)
  }
  const at = async (locator, inset = 10) => {
    const box = await locator.boundingBox()
    return { x: box.x + inset, y: box.y + box.height / 2 }
  }
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.evaluate(({ key, fixture }) => {
      localStorage.setItem(key, JSON.stringify(fixture))
      window.dispatchEvent(new StorageEvent('storage', { key }))
    }, { key, fixture })
    await page.waitForFunction(() => document.querySelector('.dsh-space-heading')?.getBoundingClientRect().left >= 0)
    const headings = projects.slice(0, 2).map(item => page.getByRole('button', { name: item.title, exact: true }).first())
    const first = await at(headings[0], 60)
    await page.mouse.click(first.x, first.y, { button: 'right' })
    await assertMenu(`${projects[0].title} 工作区操作`)
    const same = await at(headings[0])
    await page.mouse.click(same.x, same.y, { button: 'right' })
    await assertMenu(`${projects[0].title} 工作区操作`)
    await page.keyboard.press('Escape')
    if (await page.locator('.dsh-space-menu-panel:popover-open,.dsh-space-menu-backdrop').count())
      throw new Error('Escape 未完整关闭菜单')
    await page.mouse.click(first.x, first.y, { button: 'right' })
    await assertMenu(`${projects[0].title} 工作区操作`)
    await page.keyboard.press('Tab')
    if (await page.locator('.dsh-space-menu-panel:popover-open,.dsh-space-menu-backdrop').count())
      throw new Error('Tab 离开菜单时未释放遮罩')

    const source = await at(headings[0], 100)
    await page.mouse.click(source.x, source.y, { button: 'right' })
    const target = await at(headings[1])
    await page.mouse.click(target.x, target.y, { button: 'right' })
    await assertMenu(`${projects[1].title} 工作区操作`)
    await page.keyboard.press('Escape')

    const session = page.locator(`[data-session-id="${projects[0].sessionIds[0]}"]`)
    const archive = session.locator('button[aria-label^="归档"]')
    await session.hover()
    await archive.click({ button: 'right' })
    const sessionMenu = await session.locator('.dsh-space-menu-trigger').getAttribute('aria-label')
    await assertMenu(sessionMenu)
    if (await page.locator('.dsh-space-session.confirming').count())
      throw new Error('右击归档按钮不应进入归档确认')
    await page.screenshot({ path: 'output/playwright/sidebar-context-menu.png' })
    const current = await page.evaluate(() => document.querySelector('.dsh-space-session.current')?.getAttribute('data-session-id'))
    await page.mouse.click(first.x, first.y)
    if (await page.locator('.dsh-space-menu-backdrop').count()
      || await page.evaluate(() => document.querySelector('.dsh-space-session.current')?.getAttribute('data-session-id')) !== current) {
      throw new Error('首次左键背景点击未只关闭菜单')
    }
    await page.getByRole('button', { name: '对话分区操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '管理对话目录', exact: true }).click()
    const dialog = page.locator('dialog.dsh-space-dialog')
    for (const key of ['Escape', 'Tab']) {
      const trigger = dialog.locator('.dsh-space-menu-trigger').first()
      await trigger.click()
      await assertMenu(await trigger.getAttribute('aria-label'))
      await page.keyboard.press(key)
      if (!(await dialog.isVisible()) || await page.locator('.dsh-space-menu-panel:popover-open,.dsh-space-menu-backdrop').count())
        throw new Error(`${key} 关闭嵌套菜单时不应退出父弹窗或残留遮罩`)
    }
    await dialog.getByRole('button', { name: '关闭', exact: true }).first().click()
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('打开菜单不应修改工作区与会话')
    return { rightMouseRelease: true, repeatContext: true, switchContext: true, rightActionIcon: true, leftClickShield: true, escapeAndTab: true, parentDialogRetained: true, registryUnchanged: true }
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
