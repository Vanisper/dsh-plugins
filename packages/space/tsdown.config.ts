import { defineConfig } from 'tsdown'

// 客户端使用独立作用域，允许 ModuleLoader 在同一页面重新装载
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'lib',
    dts: true,
    clean: true,
  },
  {
    entry: ['src/client/client.ts'],
    noExternal: ['lucide'],
    format: ['iife'],
    outputOptions: { entryFileNames: 'client.js' },
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    dts: false,
    clean: false,
  },
])
