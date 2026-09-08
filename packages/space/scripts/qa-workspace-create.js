// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-workspace-create.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _workspaceCreateRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const viewport = page.viewportSize()
  const captures = []
  let selectedPath = `${before.root}/existing-folder`
  const picker = async (route) => {
    const request = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { path: selectedPath } } }) })
  }
  await page.route('**/api/host.pickDirectory', picker)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '创建工作区', exact: true })
    if (await dialog.getByRole('radio', { name: '空间', exact: true }).getAttribute('aria-checked') !== 'true')
      throw new Error('创建工作区应默认空间')
    for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height })
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme })
        const bounds = await dialog.boundingBox()
        if (await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1) || bounds.x < 0 || bounds.x + bounds.width > width)
          throw new Error(`创建表单越界：${width}`)
        await page.screenshot({ path: `output/playwright/workspace-create-${width}-${scheme}.png` })
        captures.push({ width, scheme })
      }
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await dialog.getByRole('radio', { name: '目录', exact: true }).click()
    await dialog.getByRole('button', { name: '选择目录', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.dsh-space-dialog')?.getAttribute('aria-busy') === 'false')
    if (!await dialog.getByRole('button', { name: '选择目录', exact: true }).textContent().then(text => text.includes(selectedPath)))
      throw new Error('所选目录没有成为工作目录')
    await page.screenshot({ path: 'output/playwright/workspace-create-directory.png' })
    await dialog.getByRole('radio', { name: '空间', exact: true }).click()
    selectedPath = `${before.root}/another-folder`
    await dialog.getByRole('button', { name: '添加成员目录', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.dsh-space-dialog')?.getAttribute('aria-busy') === 'false')
    if (await dialog.locator('.dsh-space-working-directory.pending').count() || await dialog.locator('[data-member-path]').count() !== 1)
      throw new Error('目录升级不应生成新工作目录')
    await page.screenshot({ path: 'output/playwright/workspace-create-promoted.png' })
    await page.keyboard.press('Escape')
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('创建草稿验收不应写入工作区')
    return { captures, promotionKeepsDirectory: true, registryUnchanged: true }
  }
  finally {
    await page.keyboard.press('Escape')
    await page.unroute('**/api/host.pickDirectory', picker)
    await page.emulateMedia({ colorScheme: null })
    if (viewport)
      await page.setViewportSize(viewport)
  }
}
