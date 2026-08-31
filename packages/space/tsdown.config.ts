import { defineConfig } from 'tsdown'

// package.json dependencies 会被 tsdown 自动外置，dsh 宿主提供的能力包因而不进产物
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'lib',
  dts: true,
  clean: true,
})
