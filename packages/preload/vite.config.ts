import { defineConfig } from 'vite'
import path from 'path'

const isExternal = (id: string) => {
  if (id === 'electron' || id.startsWith('electron/')) return true
  if (path.isAbsolute(id)) return false
  if (id.startsWith('.') || id.startsWith('@cuervok/')) return false
  return true
}

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, '../../dist/preload'),
    lib: {
      entry: path.resolve(__dirname, 'index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      external: isExternal
    },
    minify: 'esbuild',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@cuervok/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  }
})
