import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 的網址帶 repo 名稱作為子路徑，打包時要有 base，否則資源會 404。
// 開發伺服器維持 '/'，不然本機要打 localhost:5173/Tarot-fontEnd/ 才進得去。
// 部署到別的地方（例如自訂網域或 Render）時，用 VITE_BASE_PATH=/ 覆蓋。
const GITHUB_PAGES_BASE = '/Tarot-fontEnd/'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_BASE_PATH || GITHUB_PAGES_BASE : '/',
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 預設連本機後端 4000；Claude 測試時用 API_PROXY_TARGET 指到自己的後端，避免干擾開發中的伺服器
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000',
      // 牌卡圖片由後端的 /cards 靜態提供
      '/cards': process.env.API_PROXY_TARGET || 'http://localhost:4000',
      // 雷諾曼牌面（v27）由後端的 /lenormand 靜態提供。前端也有 /lenormand 這個頁面，
      // 所以只轉 /lenormand/ 底下的檔案（^ 開頭是正規表示式），重新整理 /lenormand 頁面時才不會被轉去後端
      '^/lenormand/.+': process.env.API_PROXY_TARGET || 'http://localhost:4000',
    },
  },
}))
