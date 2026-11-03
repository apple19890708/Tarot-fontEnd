// 列出像素字型要包含的字（計畫書 doc/v01-pixel-night-home-plan.md 2.7.2）。
// 字型檔只抽有用到的字，漏掉的字會退回 Noto Serif TC、混在像素字裡很明顯，所以新增用到像素字的文字後要重跑：
//
//   node scripts/pixel-font-chars.mjs > chars.txt
//   python -m fontTools.subset <fusion-pixel-12px-proportional-zh_tw.otf> --text-file=chars.txt \
//     --unicodes=U+0020-007E --flavor=woff2 --output-file=src/assets/fonts/fusion-pixel-12px-zh_tw.subset.woff2
//
// 來源：首頁占卜流程的元件、我的紀錄、頂部導覽列（整個檔案，寧可多收幾個字）、78 張牌名、後端牌陣檔的名稱與位置。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const files = [
  'src/pages/HomeView.vue',
  'src/components/StepQuestion.vue',
  'src/components/StepDraw.vue',
  'src/components/StepResult.vue',
  'src/components/SpreadSlots.vue',
  'src/components/SpreadLayout.vue',
  'src/components/FanDeck.vue',
  'src/components/FlyingCard.vue',
  'src/pages/HistoryView.vue',
  'src/components/ReadingHistoryIndex.vue',
  // 頂部導覽列（連結文字是路由的 meta.title）
  'src/App.vue',
  'src/router/index.ts',
  'src/pages/AdminUsers.vue',
]

// 牌名存在後端資料庫，這裡直接列：22 張大牌，四花色 × 十四階
const MAJORS = '愚人 魔術師 女祭司 女皇 皇帝 教皇 戀人 戰車 力量 隱士 命運之輪 正義 吊人 死神 節制 惡魔 塔 星星 月亮 太陽 審判 世界'
const SUITS = '權杖 聖杯 寶劍 錢幣'
const RANKS = '王牌 二 三 四 五 六 七 八 九 十 侍者 騎士 皇后 國王'

let text = `${MAJORS} ${SUITS} ${RANKS} 正位 逆位 —`
for (const f of files) text += readFileSync(root + f, 'utf8')
try {
  // 牌陣名稱與位置在後端；兩個 repo 放在同一層
  text += readFileSync(root + '../Tarot-backend/src/data/spreads.js', 'utf8')
} catch {
  console.error('找不到 ../Tarot-backend/src/data/spreads.js，牌陣名稱與位置沒有收進去')
}

const cjk = [...new Set(text.match(/[　-〿一-鿿＀-￯—…「」]/g) ?? [])]
process.stdout.write(cjk.join(''))
console.error(`共 ${cjk.length} 字`)
