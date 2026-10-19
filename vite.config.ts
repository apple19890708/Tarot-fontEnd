import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 預設連本機後端 4000；Claude 測試時用 API_PROXY_TARGET 指到自己的後端，避免干擾開發中的伺服器
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000',
      // 牌卡圖片由後端的 /cards 靜態提供
      '/cards': process.env.API_PROXY_TARGET || 'http://localhost:4000',
    },
  },
})
