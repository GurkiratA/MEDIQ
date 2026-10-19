/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_PORT = Number(process.env.MEDIQ_API_PORT ?? 8787)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // All AI provider calls go through the local Node backend so API keys
      // never reach the browser.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
  optimizeDeps: {
    // onnxruntime-web resolves its WASM relative to its own module URL;
    // pre-bundling breaks that, so serve it as-is.
    exclude: ['onnxruntime-web'],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
    css: false,
  },
})
