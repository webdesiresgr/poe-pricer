import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api-ninja': {
        target: 'https://poe.ninja',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-ninja/, '')
      },
      '/api-poe': {
        target: 'https://www.pathofexile.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-poe/, ''),
        headers: {
          'Origin': 'https://www.pathofexile.com',
          'Referer': 'https://www.pathofexile.com/'
        }
      }
    }
  }
})
