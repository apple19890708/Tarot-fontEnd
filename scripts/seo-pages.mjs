// 打包後的 SEO 處理（v24 第六節 4-1～4-5），由 npm run build 在 vite build 之後呼叫：
// 1. dist/index.html 的 __SITE_URL__ 換成網站完整網址（canonical、og:url、og:image 不能用相對路徑）
// 2. 公開頁（src/seo.json 的 pages）各複製一份 dist/<path>/index.html，換上自己的標題、描述、canonical。
//    GitHub Pages 直接開 /privacy 時原本靠 404.html 接手，畫面正常但 HTTP 狀態是 404，Google 會當成不存在
// 3. 產生 dist/sitemap.xml（只列公開頁），到 Google Search Console 手動提交
//    （robots.txt 只認網域根目錄，掛在 github.io 子路徑底下放不了，見計畫書 6.1）
//
// 4. 加上 CSP（v24 3-3）：token 存在 localStorage，萬一出現 XSS 會被偷走；CSP 擋掉外來的腳本當第二道防線。
//    GitHub Pages 不能設回應標頭，只能用 <meta http-equiv>（不支援 frame-ancestors，那條由後端 helmet 管不到前端，略過）。
//    index.html 的內嵌腳本（日夜模式）用 sha256 放行，內容改了這裡會自動重算
//
// 網址：SITE_ORIGIN（預設 GitHub Pages 的網域）＋ VITE_BASE_PATH（同 vite.config.ts，預設 /Tarot-fontEnd/）。
// 之後換自訂網域時設這兩個環境變數即可
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const seo = JSON.parse(readFileSync(join(root, 'src', 'seo.json'), 'utf8'))

const origin = (process.env.SITE_ORIGIN || 'https://apple19890708.github.io').replace(/\/+$/, '')
const base = `/${(process.env.VITE_BASE_PATH || '/Tarot-fontEnd/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
const siteUrl = `${origin}${base}`

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pageUrl = (path) => (path ? `${siteUrl}${path}/` : siteUrl)

// 換掉 <meta name|property="key" content="…"> 的 content；找不到就丟錯，避免 index.html 改了標籤卻默默沒換到
function setMeta(html, attr, key, value) {
  const pattern = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`)
  if (!pattern.test(html)) throw new Error(`index.html 找不到 <meta ${attr}="${key}">`)
  return html.replace(pattern, `$1${escape(value)}$2`)
}

function pageHtml(template, page) {
  const url = pageUrl(page.path)
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
  html = setMeta(html, 'name', 'description', page.description)
  html = setMeta(html, 'property', 'og:title', page.title)
  html = setMeta(html, 'property', 'og:description', page.description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'name', 'twitter:title', page.title)
  html = setMeta(html, 'name', 'twitter:description', page.description)
  return html
}

// ---- CSP ----
// API 的來源：和 vite build 讀同一份 VITE_API_BASE_URL（.env 或 CI 的環境變數）；空的代表走同源
const apiBase = process.env.VITE_API_BASE_URL ?? loadEnv('production', root, 'VITE_').VITE_API_BASE_URL ?? ''
const apiOrigin = apiBase ? new URL(apiBase).origin : ''
const GOOGLE_GSI = 'https://accounts.google.com/gsi/'

function contentSecurityPolicy(html) {
  // 內嵌的 <script>（沒有 src 的）逐一算 sha256
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, body]) => body)
    .filter((body) => body.trim())
    .map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...hashes, `${GOOGLE_GSI}client`],
    // Vue 的 :style 綁定與 Google 按鈕都會寫 inline style
    'style-src': ["'self'", "'unsafe-inline'", `${GOOGLE_GSI}style`],
    // 牌卡圖片在後端（/cards），其他圖片可能來自 https（股票 logo 之類）
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(apiOrigin ? [apiOrigin] : []), GOOGLE_GSI],
    'frame-src': [GOOGLE_GSI],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

const indexPath = join(dist, 'index.html')
let template = readFileSync(indexPath, 'utf8').replaceAll('__SITE_URL__', siteUrl)
if (!template.includes('<meta charset="UTF-8" />')) throw new Error('index.html 找不到 <meta charset="UTF-8" />，CSP 放不進去')
template = template.replace(
  '<meta charset="UTF-8" />',
  `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(template)}" />`,
)
writeFileSync(indexPath, template)

for (const page of seo.pages.filter((item) => item.path)) {
  const dir = join(dist, page.path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), pageHtml(template, page))
}

const today = new Date().toISOString().slice(0, 10)
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...seo.pages.map((page) => `  <url><loc>${pageUrl(page.path)}</loc><lastmod>${today}</lastmod></url>`),
  '</urlset>',
  '',
].join('\n')
writeFileSync(join(dist, 'sitemap.xml'), sitemap)

console.log(`SEO：網址 ${siteUrl}，公開頁 ${seo.pages.length} 頁，已產生 sitemap.xml；CSP 的 API 來源：${apiOrigin || '同源'}`)
