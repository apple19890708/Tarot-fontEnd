// 字型檔只抽有用到的字，漏掉的字會退回 Noto Serif TC、混在像素字裡很明顯（大小、粗細都不一樣），
// 所以新增用到像素字（font-pixel）的文字後要重跑：
//
//   node scripts/pixel-font-chars.mjs > chars.txt
//   python -m fontTools.subset <fusion-pixel-12px-proportional-zh_tw.otf> --text-file=chars.txt \
//     --unicodes=U+0020-007E --flavor=woff2 --output-file=src/assets/fonts/fusion-pixel-12px-zh_tw.subset.woff2
//
// 原始字型：縫合像素 12px proportional（OFL），github.com/TakWolf/fusion-pixel-font 的 release，目前用 2026.10.25。
//
// 來源：src 底下所有用到 font-pixel 的 .vue／.ts（整個檔案，寧可多收幾個字）、路由標題（導覽列的連結文字）、
// 78 張牌名、後端牌陣檔的名稱與位置。用掃描的，新增頁面時不會漏掉。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

// 牌名存在後端資料庫，這裡直接列：22 張大牌，四花色 × 十四階
const MAJORS = '愚人 魔術師 女祭司 女皇 皇帝 教皇 戀人 戰車 力量 隱士 命運之輪 正義 吊人 死神 節制 惡魔 塔 星星 月亮 太陽 審判 世界'
const SUITS = '權杖 聖杯 寶劍 錢幣'
const RANKS = '王牌 二 三 四 五 六 七 八 九 十 侍者 騎士 皇后 國王'

let text = `${MAJORS} ${SUITS} ${RANKS} 正位 逆位 —`
const files = walk(join(root, 'src')).filter((file) => {
  const content = readFileSync(file, 'utf8')
  // 路由檔的 meta.title 是導覽列的連結文字（App.vue 用 font-pixel 顯示）
  return content.includes('font-pixel') || file.endsWith(join('router', 'index.ts'))
})
for (const file of files) text += readFileSync(file, 'utf8')
console.error(`掃描 ${files.length} 個檔案`)

// 牌陣名稱與位置在後端；兩個 repo 放在同一層
let backendFound = false
for (const dir of ['../Tbackend', '../Tarot-backend']) {
  try {
    text += readFileSync(join(root, dir, 'src/data/spreads.js'), 'utf8')
    backendFound = true
    break
  } catch {
    // 換下一個資料夾名稱試
  }
}
if (!backendFound) console.error('找不到後端的 src/data/spreads.js，牌陣名稱與位置沒有收進去')

const cjk = [...new Set(text.match(/[　-〿一-鿿＀-￯—…「」]/g) ?? [])]
process.stdout.write(cjk.join(''))
console.error(`共 ${cjk.length} 字`)
