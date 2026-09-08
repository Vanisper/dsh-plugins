// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-target-picker.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _targetPickerRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const item = before.items.find(item => item.kind !== 'chat')
  if (!item)
    throw new Error('隔离实例缺少工作区候选')
  const viewport = page.viewportSize()
  const trigger = page.getByRole('button', { name: '选择工作区', exact: true })
  const picker = page.getByRole('dialog', { name: '选择工作区', exact: true })
  const search = picker.getByRole('textbox', { name: '搜索工作区', exact: true })
  const coveredPoint = async (locator) => {
    await locator.waitFor({ state: 'visible' })
    await locator.evaluate(el => new Promise((resolve, reject) => {
      const deadline = performance.now() + 3000
      let previous = ''
      let stable = 0
      const check = () => {
        const rect = el.getBoundingClientRect()
        const current = `${rect.x},${rect.y},${rect.width},${rect.height}`
        stable = current === previous ? stable + 1 : 0
        previous = current
        if (stable >= 3)
          resolve()
        else if (performance.now() > deadline)
          reject(new Error('背景控件位置未稳定'))
        else
          requestAnimationFrame(check)
      }
      check()
    }))
    const rect = await locator.boundingBox()
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    if (!await page.evaluate(({ x, y }) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.classList.contains('dsh-space-menu-backdrop'), point))
      throw new Error('背景点击位置不在视口拦截层内')
    return point
  }
  let failRegistry = false
  const route = async (route) => {
    if (failRegistry)
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '隔离验收读取失败' }) })
    else
      await route.continue()
  }
  const results = []
  let stage = '打开'
  try {
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1280, height: 900 })
    await trigger.click()
    await picker.locator('.dsh-space-target-list>button').first().waitFor()
    if (!await search.evaluate(el => el === document.activeElement))
      throw new Error('工作区搜索未获得初始焦点')
    for (let i = 0; i < 48; i++) {
      await page.keyboard.press(i < 24 ? 'Tab' : 'Shift+Tab')
      if (!await picker.evaluate(el => el.contains(document.activeElement)))
        throw new Error(`工作区浮层焦点泄漏：${i}`)
    }
    await trigger.evaluate(el => el.focus())
    if (!await picker.evaluate(el => el.contains(document.activeElement)))
      throw new Error('工作区浮层未阻止背景焦点')
    await search.fill(item.path)
    if (await picker.locator('.dsh-space-target-list>button').count() !== 1)
      throw new Error('路径搜索未得到唯一候选')
    await search.fill('不会存在的工作区验收名称')
    await picker.getByText('没有匹配的工作区', { exact: true }).waitFor()
    await picker.getByRole('button', { name: '清除工作区搜索', exact: true }).click()
    await search.fill(item.title)
    await search.press('ArrowDown')
    await page.keyboard.press('Enter')
    stage = '键盘选择后关闭'
    await picker.waitFor({ state: 'hidden' })
    if (!await trigger.evaluate(el => el === document.activeElement))
      throw new Error('工作区选择后未恢复触发器焦点')
    await trigger.click()
    await picker.locator('.dsh-space-target-list>button[aria-pressed=true]').waitFor()
    for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
      stage = `视口 ${width}`
      await page.setViewportSize({ width, height })
      await page.waitForFunction(({ width, height }) => {
        const element = document.querySelector('.dsh-space-target-picker')
        const rect = element?.getBoundingClientRect()
        return rect && rect.x >= 0 && rect.y >= 0 && rect.right <= width && rect.bottom <= height
      }, { width, height })
      const bounds = await picker.boundingBox()
      const overflow = await picker.evaluate(el => el.scrollWidth > el.clientWidth + 1)
      if (overflow || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width || bounds.y + bounds.height > height)
        throw new Error(`工作区浮层越界：${width}`)
      await page.screenshot({ path: `output/playwright/target-picker-${width}.png` })
      results.push({ width, height, overflow })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'))
    await page.screenshot({ path: 'output/playwright/target-picker-dark.png' })
    await page.emulateMedia({ colorScheme: 'light' })
    stage = '跨尺寸后关闭'
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    const expand = page.getByRole('button', { name: '打开侧边栏', exact: true })
    if (await expand.isVisible())
      await expand.click()
    await trigger.click()
    stage = '点击背景关闭'
    const settings = await coveredPoint(page.getByRole('button', { name: '设置', exact: true }))
    await page.mouse.click(settings.x, settings.y)
    await picker.waitFor({ state: 'hidden' })
    if (await page.getByRole('dialog').count())
      throw new Error('关闭浮层的背景点击穿透到设置')
    await trigger.click()
    stage = '右键交接'
    const row = page.locator('.dsh-space-heading').filter({ hasText: item.title }).first()
    const target = await coveredPoint(row)
    await page.mouse.click(target.x, target.y, { button: 'right' })
    await page.getByRole('menu', { name: `${item.title} 工作区操作`, exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.route('**/api/dsh-space/registry', route)
    failRegistry = true
    stage = '错误重试'
    await trigger.click()
    await picker.getByText('工作区读取失败', { exact: true }).waitFor()
    failRegistry = false
    await picker.getByRole('button', { name: '重试读取工作区', exact: true }).click()
    await picker.locator('.dsh-space-target-list>button').first().waitFor()
    await picker.getByRole('button', { name: '新建工作区', exact: true }).click()
    stage = '新建入口'
    const create = page.getByRole('dialog', { name: '创建工作区', exact: true })
    await create.waitFor()
    if (!await create.getByRole('radio', { name: '空间', exact: true }).isChecked())
      throw new Error('工作区选择入口新建应默认空间')
    if (await picker.isVisible())
      throw new Error('新建工作区时未关闭选择浮层')
    await page.keyboard.press('Escape')
    await trigger.click()
    await picker.getByRole('button', { name: '独立对话', exact: true }).click()
    if (!await trigger.getByText('独立对话', { exact: true }).isVisible())
      throw new Error('独立对话切换未恢复草稿意图')
    await page.unroute('**/api/dsh-space/registry', route)
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(before.items) !== JSON.stringify(after.items))
      throw new Error('工作区选择验收不应写入工作区数据')
    return { viewports: results, darkTheme: true, focusCycle: 48, search: true, selectedCheck: true, backgroundBlocked: true, contextMenuHandoff: true, retry: true, createEntry: true, registryUnchanged: true }
  }
  catch (error) {
    throw new Error(`${stage}: ${error.message}`)
  }
  finally {
    await page.unroute('**/api/dsh-space/registry', route)
    await page.keyboard.press('Escape')
    await page.emulateMedia({ colorScheme: null })
    if (viewport)
      await page.setViewportSize(viewport)
  }
}
