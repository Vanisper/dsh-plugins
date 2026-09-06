import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { build } from 'tsdown'
import { expect, it, vi } from 'vitest'

it('发布产物可在同一页面重复装载，变量不进入全局作用域', async () => {
  const output = await mkdtemp(join(tmpdir(), 'dsh-space-bundle-'))
  try {
    await build({
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      config: fileURLToPath(new URL('../../tsdown.config.ts', import.meta.url)),
      outDir: output,
      logLevel: 'silent',
    })
    const source = await readFile(join(output, 'client.js'), 'utf8')
    const load = vi.fn()
    const context = createContext({ __ModuleLoader__: { load } })
    runInContext(source, context)
    runInContext(source, context)
    expect(load).toHaveBeenCalledTimes(2)
    expect(Object.keys(context)).toEqual(['__ModuleLoader__'])
    for (const [entry] of load.mock.calls) {
      expect(entry.id).toBe('dsh-space')
      const module = entry.factory(() => ({}))
      expect(module.inject).toEqual(['slots', 'sessions', 'workspaces'])
      expect(module.apply).toBeTypeOf('function')
    }
  }
  finally {
    await rm(output, { recursive: true, force: true })
  }
}, 15000)
