// 在隔离验收实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-native-picker.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 读取并调用
async function _nativePickerRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const results = []
  for (const flow of [
    { trigger: '创建工作区', title: '创建工作区', mode: '目录', picker: '选择目录' },
    { trigger: '创建工作区', title: '创建工作区', picker: '添加成员目录' },
    { trigger: '零成员验收空间 工作区操作', item: '编辑工作区', title: '编辑工作区', picker: '添加成员目录' },
  ]) {
    for (const outcome of ['cancel', 'select', 'error']) {
      let release
      let received
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const requestReceived = new Promise((resolve) => {
        received = resolve
      })
      const routeHandler = async (route) => {
        const request = route.request().postDataJSON()
        received()
        await gate
        await route.fulfill({
          status: outcome === 'error' ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { path: outcome === 'select' ? before.root : null } } }),
        })
      }
      // 只延迟原生选择器 RPC；真实页面继续处理键盘和 React 更新，不启动系统窗口
      await page.route('**/api/host.pickDirectory', routeHandler)
      try {
        await page.getByRole('button', { name: flow.trigger, exact: true }).click()
        if (flow.item)
          await page.getByRole('menuitem', { name: flow.item, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: flow.title, exact: true })
        if (flow.mode)
          await dialog.getByRole('radio', { name: flow.mode, exact: true }).click()
        await dialog.getByRole('button', { name: flow.picker, exact: true }).click()
        await requestReceived
        if (!await dialog.evaluate(element => element.open && element.getAttribute('closedby') === 'none'))
          throw new Error(`未锁定父弹窗：${flow.title}`)
        await page.evaluate(() => {
          window.pickerKeyLeaks = []
          window.pickerKeyProbe = event => window.pickerKeyLeaks.push(event.key)
          document.addEventListener('keydown', window.pickerKeyProbe)
        })
        for (const key of ['Tab', 'Shift+Tab', 'Escape', 'Escape', 'Enter', 'Space', 'Control+n'])
          await page.keyboard.press(key)
        await page.mouse.click(10, 10)
        if (!await dialog.evaluate(element => element.open) || await page.evaluate(() => window.pickerKeyLeaks.length))
          throw new Error(`选择器等待期间网页仍响应操作：${flow.title}`)
        release()
        await page.waitForFunction(() => document.querySelector('.dsh-space-dialog')?.getAttribute('aria-busy') === 'false')
        await page.waitForFunction(label => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent) === label, flow.picker)
        if (await dialog.getAttribute('closedby') !== 'closerequest')
          throw new Error(`关闭保护未释放：${flow.title}`)
        if (outcome === 'select') {
          const accepted = flow.picker === '选择目录'
            ? (await dialog.getByRole('button', { name: '选择目录', exact: true }).textContent()).includes(before.root)
            : await dialog.locator('[data-member-path]').count() === 1
          if (!accepted)
            throw new Error(`选择结果未进入草稿：${flow.title}`)
        }
        if (outcome === 'error' && !await dialog.getByRole('alert').isVisible())
          throw new Error(`选择器错误未展示：${flow.title}`)
        await page.keyboard.press('Tab')
        if (!await dialog.evaluate(element => element.contains(document.activeElement)))
          throw new Error(`返回后丢失模态焦点约束：${flow.title}`)
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        results.push({ title: flow.title, outcome })
      }
      finally {
        release()
        await page.unroute('**/api/host.pickDirectory', routeHandler)
        await page.evaluate(() => document.removeEventListener('keydown', window.pickerKeyProbe))
      }
    }
  }
  const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (JSON.stringify(before.workspaces) !== JSON.stringify(after.workspaces) || JSON.stringify(before.items) !== JSON.stringify(after.items))
    throw new Error('验收不应创建或修改核心实体')
  return { passed: results, registryUnchanged: true }
}
