import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [
    react(),
    process.env.NODE_ENV === 'production' && obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'mangled',
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 0.6,
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
      },
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, '../../dist/renderer'),
    emptyOutDir: true,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cuervok/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The renderer fetches /api/* relatively (login, token renewal,
    // overrides bridge…).  Proxy to the client's local server (hono), which
    // stamps the client attestation and forwards to the emulator's Auth.
    // Without this the dev server would 404 every /api call and neither the
    // login nor the automatic token renewal could ever work in dev.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false
      }
    }
  },
  css: {
    postcss: {
      plugins: []
    }
  }
})
