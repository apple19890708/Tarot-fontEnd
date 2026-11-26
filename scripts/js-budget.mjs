#!/usr/bin/env node
// 首頁 JS 大小預算（2026-11-26 前端優化 C8）：打開首頁（塔羅占卜）一定會下載的 JS，gzip 後加總，超過預算就失敗。
// 「一定會下載」＝入口 index.html 與首頁 HomeView 的 chunk，加上它們靜態 import 的所有 chunk（動態 import 的不算，
// 例如股市圖表、PDF 匯出、AI 解讀的 Markdown）。資料來源是 vite 的 manifest（vite.config.ts 的 build.manifest）。
//
//   node scripts/js-budget.mjs            檢查（npm run build 最後一步會跑）
//   node scripts/js-budget.mjs --verbose  另外列出每一個 chunk
//
// 預算要調整時改下面的 BUDGET_KB，並在旁邊寫原因與量到的數字。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

// 2026-11-26：改動前 292.8 KB（股市圖表 MarketPanel 118.5 KB 跟著首頁下載）；股市圖表改成非同步元件、
// 數字格式化從 marketChart 搬出來（原本連 chart.js 一起拉進首頁）之後是 178.7 KB，預算留一點空間。
// 超過時先看是不是又有大套件被首頁靜態 import 進來（--verbose 看清單），不要直接調高
const BUDGET_KB = 190

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')
const MANIFEST = join(DIST, '.vite', 'manifest.json')
// 首頁要算的起點：入口與首頁頁面（router 以動態 import 載入，但一進站就會載）
const ENTRIES = ['index.html', 'src/pages/HomeView.vue']

if (!existsSync(MANIFEST)) {
  console.error('找不到 dist/.vite/manifest.json，請先 npm run build（vite.config.ts 要開 build.manifest）。')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const seen = new Set()

function walk(key) {
  if (seen.has(key)) return
  const chunk = manifest[key]
  if (!chunk) return
  seen.add(key)
  for (const next of chunk.imports ?? []) walk(next)
}
for (const entry of ENTRIES) walk(entry)

const files = [...seen]
  .map((key) => manifest[key].file)
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const raw = readFileSync(join(DIST, file))
    return { file, raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length }
  })
  .sort((a, b) => b.gzip - a.gzip)

const total = files.reduce((sum, item) => sum + item.gzip, 0)
const totalKb = total / 1024
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

if (process.argv.includes('--verbose')) {
  for (const item of files) console.log(`  ${kb(item.gzip).padStart(9)}  ${item.file}`)
}

const line = `首頁 JS（gzip）：${totalKb.toFixed(1)} KB／預算 ${BUDGET_KB} KB，共 ${files.length} 個檔案`
if (totalKb > BUDGET_KB) {
  console.error(`✘ ${line}`)
  console.error('最大的幾個：' + files.slice(0, 5).map((item) => `${item.file}（${kb(item.gzip)}）`).join('、'))
  process.exit(1)
}
console.log(`✔ ${line}`)
