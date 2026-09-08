// 在隔离实例中执行：playwright-cli run-code --filename packages/space/scripts/qa-file-drag.js
// eslint-disable-next-line no-unused-vars -- 由 playwright-cli 调用
async function _fileDragRegression(page) {
  const before = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
  if (!['127.0.0.1', 'localhost'].includes(await page.evaluate(() => location.hostname))
    || !/^\/(?:private\/)?tmp\/dsh-space-smoke\./.test(before.root)) {
    throw new Error('只允许对 dsh-space-smoke 临时实例运行验收')
  }
  const source = before.root.replace(/\/managed\/?$/, '/source-a')
  const cdp = await page.context().newCDPSession(page)
  const send = async (type, x, y, files = [source]) => cdp.send('Input.dispatchDragEvent', {
    type,
    x,
    y,
    data: { items: [], files, dragOperationsMask: 1 },
  })
  const cancel = async (x, y) => {
    await send('dragCancel', x, y)
    // CDP 外部拖入没有页面内源节点，不自动发送源端 dragend
    await page.evaluate(() => window.dispatchEvent(new DragEvent('dragend')))
  }
  let payload
  const inspectDirectory = async () => {
    try {
    // 使用浏览器真实的文件拖入转换，避免用 JS 伪造 File.path 得到假阳性
      await page.evaluate(() => {
        window.__fileDragProbe = (event) => {
          event.preventDefault()
          event.stopImmediatePropagation()
          event.dataTransfer.dropEffect = 'copy'
          if (event.type === 'drop') {
            window.__fileDragPayload = {
              types: [...event.dataTransfer.types],
              uri: event.dataTransfer.getData('text/uri-list'),
              files: [...event.dataTransfer.files].map(file => ({ name: file.name, path: file.path ?? null, relativePath: file.webkitRelativePath })),
              entries: [...event.dataTransfer.items].map((item) => {
                const entry = item.webkitGetAsEntry()
                return entry && { name: entry.name, fullPath: entry.fullPath, directory: entry.isDirectory }
              }),
            }
          }
        }
        for (const type of ['dragenter', 'dragover', 'drop'])
          window.addEventListener(type, window.__fileDragProbe, true)
      })
      await send('dragEnter', 600, 300)
      await send('dragOver', 600, 300)
      await send('drop', 600, 300)
      payload = await page.evaluate(() => window.__fileDragPayload)
      if (!payload?.entries[0]?.directory || payload.entries[0].fullPath !== '/source-a' || payload.files[0].path !== null || payload.uri)
        throw new Error(`浏览器目录拖入契约有变化，请重新审查：${JSON.stringify(payload)}`)
    }
    finally {
      await page.evaluate(() => {
        for (const type of ['dragenter', 'dragover', 'drop'])
          window.removeEventListener(type, window.__fileDragProbe, true)
        delete window.__fileDragProbe
        delete window.__fileDragPayload
      })
      await cancel(600, 300)
    }
  }
  try {
    await inspectDirectory()
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '创建工作区', exact: true })
    await page.evaluate(() => {
      window.__fileDragLeaks = []
      window.__fileDragListener = event => window.__fileDragLeaks.push(event.type)
      for (const type of ['dragenter', 'dragover', 'drop'])
        document.addEventListener(type, window.__fileDragListener)
    })
    const box = await dialog.boundingBox()
    await send('dragEnter', box.x + 30, box.y + 50)
    await send('dragOver', box.x + 30, box.y + 50)
    const leaks = await page.evaluate(() => window.__fileDragLeaks)
    await cancel(box.x + 30, box.y + 50)
    if (leaks.length)
      throw new Error(`文件拖入弹窗仍传到后台上传：${leaks.join(', ')}`)
    if (await page.getByText(/^(图片拖动到此处即可添加|当前无法添加图片)$/).count())
      throw new Error('弹窗打开时仍显示宿主图片上传层')
    await page.screenshot({ path: 'output/playwright/workspace-file-drag-blocked.png' })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await send('dragEnter', 600, 300)
    if (!(await page.evaluate(() => window.__fileDragLeaks)).includes('dragenter'))
      throw new Error('关闭弹窗后未恢复宿主拖拽')
    await page.getByText(/^(图片拖动到此处即可添加|当前无法添加图片)$/).waitFor()
    await cancel(600, 300)
    const after = await page.evaluate(async () => (await fetch('/api/dsh-space/registry')).json())
    if (JSON.stringify(after) !== JSON.stringify(before))
      throw new Error('拖拽验收意外修改了工作区注册表')
    return { ok: true, payload, checks: ['browser-path-limitation', 'modal-isolation', 'host-restored', 'registry-unchanged'] }
  }
  finally {
    await cancel(600, 300)
    await cdp.detach()
    const dialog = page.getByRole('dialog', { name: '创建工作区', exact: true })
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.evaluate(() => {
      for (const type of ['dragenter', 'dragover', 'drop'])
        document.removeEventListener(type, window.__fileDragListener)
      delete window.__fileDragLeaks
      delete window.__fileDragListener
    })
  }
}
