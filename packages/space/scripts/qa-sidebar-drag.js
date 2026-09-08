// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-sidebar-drag.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _sidebarDragRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const key = 'dsh-space.sidebar.layout'
  const previous = await page.evaluate(key => localStorage.getItem(key), key)
  const viewport = page.viewportSize()
  const projects = before.items.filter(item => item.kind === 'space' && item.sessionIds.length)
  const sessionId = projects[0].sessionIds[0]
  const otherId = projects[1].sessionIds[0]
  const base = { pins: [], sections: ['pinned', 'workspaces', 'chats', 'misc'], collapsed: ['chats'], view: 'workspaces', sorts: {}, orders: {}, groups: [], assignments: {}, foldedLists: [] }
  const fixture = async (patch) => {
    await page.evaluate(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
      window.dispatchEvent(new StorageEvent('storage', { key }))
    }, { key, value: { ...base, ...patch } })
    await page.locator('.dsh-space-list').evaluate((el) => {
      el.scrollTop = 0
    })
  }
  const move = async (target, fraction) => {
    const box = await target.boundingBox()
    await page.mouse.move(box.x + Math.min(100, box.width / 2), box.y + box.height * fraction, { steps: 12 })
  }
  const start = async (source, target, fraction = 0.25) => {
    await source.scrollIntoViewIfNeeded()
    const box = await source.boundingBox()
    await page.mouse.move(box.x + 40, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 48, box.y + box.height / 2 + 8, { steps: 3 })
    await move(target, fraction)
    await page.waitForFunction(() => document.body.hasAttribute('data-dsh-space-dragging'))
  }
  const cancel = async () => {
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForFunction(() => !document.body.hasAttribute('data-dsh-space-dragging'))
  }
  const layout = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await fixture({})
    await page.waitForFunction(() => {
      const root = document.querySelector('.dsh-space-root')
      return root?.getBoundingClientRect().left >= 0 && !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.target?.contains(root))
    })
    const source = page.getByRole('button', { name: projects[0].title, exact: true }).first()
    const target = page.getByRole('button', { name: projects[1].title, exact: true }).first().locator('xpath=ancestor::section[1]')
    await start(source, target)
    await page.locator('.dsh-space-group.drop-before').waitFor()
    await move(target, 0.85)
    await page.locator('.dsh-space-group.drop-after').waitFor()
    await page.screenshot({ path: 'output/playwright/sidebar-drag-project-after.png' })
    await cancel()
    if (await page.locator('.drop-before,.drop-after,.drop-assign').count())
      throw new Error('取消后残留拖动落点')

    const groups = [{ id: 'qa-a', title: '计划', color: 'blue', collapsed: false }, { id: 'qa-b', title: '待整理', color: 'green', collapsed: true }]
    await fixture({ view: 'groups', groups, assignments: { [sessionId]: 'qa-a' } })
    const row = page.locator(`[data-session-id="${sessionId}"] .dsh-space-session-main`)
    const group = page.locator('[data-display-group="qa-b"]')
    await start(row, group, 0.5)
    await page.locator('[data-display-group="qa-b"].drop-assign').waitFor()
    await page.getByRole('button', { name: '待整理 新建会话占位', exact: true }).waitFor()
    await page.screenshot({ path: 'output/playwright/sidebar-drag-group-preview.png' })
    await cancel()
    if (!(await layout()).groups[1].collapsed || (await layout()).assignments[sessionId] !== 'qa-a')
      throw new Error('预览取消修改了持久化偏好')
    await start(row, group, 0.5)
    await page.mouse.up()
    await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).assignments[id] === 'qa-b', { key, id: sessionId })
    const groupA = page.locator('[data-display-group="qa-a"]')
    await start(group.locator('.dsh-space-section-title'), groupA, 0.2)
    await page.locator('[data-display-group="qa-a"].drop-before').waitFor()
    await page.mouse.up()
    if ((await layout()).groups[0].id !== 'qa-b')
      throw new Error('分组调序未应用前置落点')

    await fixture({ pins: [{ kind: 'workspace', id: projects[0].workspaceId }, { kind: 'session', id: otherId }], sorts: { 'project:pinned': 'manual' } })
    const pinnedTarget = page.locator(`[data-section="pinned"] [data-session-id="${otherId}"]`)
    await start(page.locator('[data-section="pinned"] .dsh-space-heading'), pinnedTarget, 0.85)
    await page.locator('[data-section="pinned"] .drop-after').waitFor()
    await page.screenshot({ path: 'output/playwright/sidebar-drag-pinned-after.png' })
    await page.mouse.up()
    if ((await layout()).orders['project:pinned'][0] !== `session:${otherId}`)
      throw new Error('混合置顶调序未应用后置落点')

    await page.setViewportSize({ width: 390, height: 600 })
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    await fixture({ view: 'groups', groups: Array.from({ length: 24 }, (_, i) => ({ id: `qa-${i}`, title: `分组 ${i + 1}`, color: 'gray', collapsed: true })) })
    const list = page.locator('.dsh-space-list')
    await start(page.locator('[data-display-group="qa-0"] .dsh-space-section-title'), list, 0.99)
    await page.waitForFunction(() => document.querySelector('.dsh-space-list')?.scrollTop > 40)
    const scrolled = await list.evaluate(el => el.scrollTop)
    await page.screenshot({ path: 'output/playwright/sidebar-drag-scroll-390.png' })
    await cancel()
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('展示拖动或取消不应修改核心工作区与会话')
    return { projectEdges: true, previewCanceled: true, assigned: true, groupReordered: true, mixedPins: true, scrolled, coreUnchanged: true }
  }
  finally {
    await cancel()
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
