// 牌面風格：原版（後端的 Rider-Waite 圖，/cards/*.jpg）或水彩版（v28 原創 SVG，/cards/*.svg）。
// 水彩版取代了原本的像素版（2026-11-25 使用者決定：原版留著、像素版不保留、牌背不動）。
// 元件一律用 cardImageUrl() 取牌面網址，切換時畫面會自動換圖。選擇記在這台瀏覽器裡。
import { ref } from 'vue'

import { imageUrl } from './api'

export type CardStyle = 'original' | 'watercolor'

const STORAGE_KEY = 'tarot.cardStyle'

// 舊版存的 'pixel'（像素版已移除）當成水彩版：選過「另一種風格」的人照樣看到另一種
export function parseCardStyle(saved: string | null): CardStyle {
  return saved === 'watercolor' || saved === 'pixel' ? 'watercolor' : 'original'
}

function loadStyle(): CardStyle {
  try {
    return parseCardStyle(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'original'
  }
}

export const cardStyle = ref<CardStyle>(loadStyle())

export function setCardStyle(style: CardStyle) {
  cardStyle.value = style
  try {
    localStorage.setItem(STORAGE_KEY, style)
  } catch {
    // 私密模式等情況存不了，這次瀏覽仍然有效
  }
}

// 後端資料庫存的是原版路徑（/cards/major-00-fool.jpg）。水彩版和原版同一個檔名、只換副檔名，
// 放在同一個資料夾（後端 doc/v28-tarot-original-art-plan.md 3-5）。只換 /cards/ 底下的 jpg，
// 其他路徑（雷諾曼的 /lenormand/、測試假資料）原樣回傳
const ORIGINAL_CARD_IMAGE = /^(\/cards\/[a-z0-9-]+)\.jpg$/

export function watercolorImagePath(image: string) {
  const match = ORIGINAL_CARD_IMAGE.exec(image)
  return match ? `${match[1]}.svg` : image
}

// 牌面圖片網址：水彩版換成同名 SVG，原版用後端的原圖；雷諾曼只有一種牌面，不受影響
export function cardImageUrl(image?: string) {
  if (!image) return ''
  return imageUrl(cardStyle.value === 'watercolor' ? watercolorImagePath(image) : image)
}

// ---- 縮圖（2026-11-26 前端優化 4）----
// 原圖是 500×863 的 JPG（約 200 KB 一張），排列圖、清單裡的小牌用不到這麼大。
// 和後端約定：縮圖網址是把 /cards/xxx.jpg 換成 /cards/thumb/xxx.webp，寬 240。
// 用 srcset 讓瀏覽器依顯示大小與螢幕密度挑：小的用縮圖，放大彈出層（CardZoomDialog）照樣用原圖。
// 只有原版的 JPG 有縮圖；水彩版是 SVG（每張 gzip 後約 2KB），直接用、不換成 /thumb/*.webp（v28 合併時確認）。
// 後端還沒產生縮圖（404）時：第一次載入失敗就整個停用縮圖，那一張當場換回原圖，不會出現破圖
export const CARD_IMAGE_WIDTH = 500
export const CARD_IMAGE_HEIGHT = 863
const THUMB_WIDTH = 240
const THUMB_DIR = '/cards/thumb/'
const thumbsDisabled = ref(false)

// /cards/cups-01.jpg → /cards/thumb/cups-01.webp；不是塔羅原版 JPG（水彩 SVG、雷諾曼 SVG、空字串）回傳 ''
export function thumbPathOf(image?: string) {
  const match = image?.match(/^\/cards\/([^/]+)\.jpe?g$/i)
  return match ? `${THUMB_DIR}${match[1]}.webp` : ''
}

// 給 <img :srcset> 用：沒有縮圖可用（水彩版、雷諾曼、縮圖已停用）時回傳 undefined，屬性就不會出現
export function cardSrcset(image?: string) {
  if (thumbsDisabled.value || !image || cardStyle.value !== 'original') return undefined
  const thumb = thumbPathOf(image)
  return thumb ? `${imageUrl(thumb)} ${THUMB_WIDTH}w, ${imageUrl(image)} ${CARD_IMAGE_WIDTH}w` : undefined
}

// 縮圖載入失敗：在 window 的 capture 階段先攔下來（比 <img @error> 早），
// 停用縮圖、拿掉這張的 srcset 讓瀏覽器改載 src 的原圖，並且不讓元件收到 error（否則會被當成破圖、改顯示牌名）
function onThumbError(event: Event) {
  const img = event.target
  if (!(img instanceof HTMLImageElement) || !img.currentSrc.includes(THUMB_DIR)) return
  event.stopImmediatePropagation()
  thumbsDisabled.value = true
  img.removeAttribute('srcset')
}
if (typeof window !== 'undefined') window.addEventListener('error', onThumbError, true)
