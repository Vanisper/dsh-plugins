import { defineConfig } from 'tsdown'

// 双产物：host（node）与 client（浏览器，ModuleLoader 装载协议的自包装束）。
// 顺序有讲究：host 配置负责 clean，client 追加写入不清场
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
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    dts: false,
    clean: false,
  },
])
