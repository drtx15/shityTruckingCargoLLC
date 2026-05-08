import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8080'
const devProxyWsTarget = devProxyTarget.replace(/^http/, 'ws')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: devProxyWsTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
