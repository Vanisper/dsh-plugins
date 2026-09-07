// 在隔离验收实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-modal-focus.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 读取并调用
async function _modalFocusRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }

  const results = []
  const viewport = page.viewportSize()
  const inspect = async (title) => {
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await dialog.waitFor()
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let index = 0; index < 24; index++) {
        await page.keyboard.press(key)
        if (!await dialog.evaluate(element => document.hasFocus() && element.contains(document.activeElement)))
          throw new Error(`焦点逃逸：${title}，${key} 第 ${index + 1} 次`)
      }
    }
    await page.evaluate(() => document.querySelector('.dsh-space-root button').focus())
    if (!await dialog.evaluate(element => element.contains(document.activeElement)))
      throw new Error(`背景取得焦点：${title}`)
    results.push({ title, tabs: 48 })
    return dialog
  }
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const flow of [
      { trigger: '零成员验收空间 工作区操作', item: '重命名', title: '重命名工作区' },
      { trigger: '零成员验收空间 会话操作', item: '重命名', title: '重命名会话' },
      { trigger: '零成员验收空间 工作区操作', item: '编辑工作区', title: '编辑工作区' },
      { trigger: '添加工作区', item: '创建空间', title: '创建空间' },
      { trigger: '添加工作区', item: '添加目录工作区', title: '添加目录工作区' },
      { trigger: '选择工作区', title: '选择工作区' },
      { trigger: '零成员验收空间 工作区操作', item: '移除工作区', title: '移除工作区' },
    ]) {
      await page.getByRole('button', { name: flow.trigger, exact: true }).click()
      if (flow.item)
        await page.getByRole('menuitem', { name: flow.item, exact: true }).click()
      if (flow.title === '移除工作区' && !await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '关闭'))
        throw new Error('移除确认的初始焦点不安全')
      await inspect(flow.title)
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: flow.title, exact: true }).waitFor({ state: 'hidden' })
    }

    await page.getByRole('button', { name: '访问模式，当前：Workspace Write', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Full access', exact: true }).click()
    const risk = await inspect('确认启用 Full access？')
    if (await risk.getByRole('checkbox').isChecked() || !await risk.getByRole('button', { name: '启用 Full access', exact: true }).isDisabled())
      throw new Error('风险确认不应被验收操作启用')
    await risk.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '访问模式，当前：Workspace Write', exact: true }).waitFor()

    for (const label of ['项目排序方式', '零成员验收空间 工作区操作', '零成员验收空间 会话操作']) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.keyboard.press('Tab')
      if (await page.getByRole('menu').count() || await page.locator('.dsh-space-menu-backdrop').count())
        throw new Error(`非模态菜单未按 Tab 退出：${label}`)
    }

    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.workspaces) !== JSON.stringify(after.workspaces) || JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('验收不应修改工作区、会话或附加描述')
    return { passed: results, registryUnchanged: true }
  }
  finally {
    await page.keyboard.press('Escape')
    if (viewport)
      await page.setViewportSize(viewport)
  }
}
