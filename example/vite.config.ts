import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 代理 PetStore API 请求
      '/api': {
        target: 'https://petstore.swagger.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v2')
      }
    }
  }
})
