// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-workspace-editor.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _workspaceEditorRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const viewport = page.viewportSize()
  const results = []
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: '验收项目 工作区操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '编辑工作区', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: '编辑工作区', exact: true })
    await dialog.getByRole('textbox', { name: '工作区名称', exact: true }).fill('未保存的工作区名称')
    await dialog.getByRole('checkbox', { name: '为 Web 前端 创建链接', exact: true }).check()
    for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height })
      const bounds = await dialog.boundingBox()
      const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)
      if (overflow || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width || bounds.y + bounds.height > height)
        throw new Error(`工作区编辑越界：${width}`)
      await page.screenshot({ path: `output/playwright/workspace-refresh-${width}.png` })
      results.push({ width, height, overflow })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await dialog.getByRole('radio', { name: '目录', exact: true }).click()
    await dialog.getByRole('textbox', { name: '工作区名称', exact: true }).press('Enter')
    if (!await dialog.isVisible())
      throw new Error('有损降级被隐式 Enter 提交')
    await page.screenshot({ path: 'output/playwright/workspace-refresh-downgrade.png' })
    await dialog.getByRole('radio', { name: '空间', exact: true }).click()
    await dialog.getByRole('button', { name: '移除工作区', exact: true }).click()
    await page.screenshot({ path: 'output/playwright/workspace-refresh-remove.png' })
    await page.getByRole('dialog', { name: '移除工作区', exact: true }).getByRole('button', { name: '取消', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '编辑工作区', exact: true })
    if (await dialog.getByRole('textbox', { name: '工作区名称', exact: true }).inputValue() !== '未保存的工作区名称'
      || !await dialog.getByRole('checkbox', { name: '为 Web 前端 创建链接', exact: true }).isChecked()) {
      throw new Error('取消移除未恢复编辑草稿')
    }
    await page.keyboard.press('Escape')
    for (const title of ['零成员验收空间', '验收项目']) {
      await page.getByRole('button', { name: `${title} 工作区操作`, exact: true }).click()
      await page.getByRole('menuitem', { name: '编辑工作区', exact: true }).click()
      const editor = page.getByRole('dialog', { name: '编辑工作区', exact: true })
      if (title === '验收项目')
        await editor.getByRole('button', { name: '移除成员 后端', exact: true }).click()
      if (await editor.getByRole('textbox', { name: '成员目录路径', exact: true }).count() || await editor.locator('.dsh-space-member-primary').count() || await editor.getByText('主要', { exact: true }).count())
        throw new Error('零／单成员不应保留手工路径入口或主要标记')
      await page.screenshot({ path: `output/playwright/workspace-member-${title === '验收项目' ? 'single' : 'empty'}.png` })
      await page.keyboard.press('Escape')
    }
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('仅操作草稿不应修改工作区')
    return { passed: results, draftRestored: true, registryUnchanged: true }
  }
  finally {
    await page.keyboard.press('Escape')
    if (viewport)
      await page.setViewportSize(viewport)
  }
}
