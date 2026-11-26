// 牌面風格：原版（後端的 Rider-Waite 圖）或像素版（src/lib/pixelTarot/engine.js 即時畫出來）。
// 元件一律用 cardImageUrl() 取牌面網址，切換時畫面會自動換圖。選擇記在這台瀏覽器裡。
import { ref, shallowRef } from 'vue'

import { imageUrl } from './api'

export type CardStyle = 'original' | 'pixel'

const STORAGE_KEY = 'tarot.cardStyle'

function loadStyle(): CardStyle {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'pixel' ? 'pixel' : 'original'
  } catch {
    return 'original'
  }
}

export const cardStyle = ref<CardStyle>(loadStyle())

// 像素引擎約 70 KB，只有切到像素版才載入；載入前（或載入失敗）先顯示原版圖
const pixelUrlOf = shallowRef<((image: string) => string | null) | null>(null)
let loading: Promise<void> | null = null

function ensureEngine() {
  if (pixelUrlOf.value || loading) return
  loading = import('./pixelTarot/engine.js')
    .then((mod) => {
      pixelUrlOf.value = mod.pixelCardUrl
    })
    .catch((error) => {
      console.error('像素牌面載入失敗，先顯示原版：', error)
    })
    .finally(() => {
      loading = null
    })
}

export function setCardStyle(style: CardStyle) {
  cardStyle.value = style
  try {
    localStorage.setItem(STORAGE_KEY, style)
  } catch {
    // 私密模式等情況存不了，這次瀏覽仍然有效
  }
  if (style === 'pixel') ensureEngine()
}

if (cardStyle.value === 'pixel') ensureEngine()

// 雷諾曼的原創 SVG（v27 3-3）：像素引擎只對應塔羅，雷諾曼一律顯示原圖
const LENORMAND_IMAGE_PREFIX = '/lenormand/'

// 牌面圖片網址：像素版對得上就用像素圖，否則用後端的原圖
export function cardImageUrl(image?: string) {
  if (!image) return ''
  if (image.startsWith(LENORMAND_IMAGE_PREFIX)) return imageUrl(image)
  if (cardStyle.value === 'pixel' && pixelUrlOf.value) {
    const url = pixelUrlOf.value(image)
    if (url) return url
  }
  return imageUrl(image)
}

// ---- 縮圖（2026-11-26 前端優化 4）----
// 原圖是 500×863 的 JPG（約 200 KB 一張），排列圖、清單裡的小牌用不到這麼大。
// 和後端約定：縮圖網址是把 /cards/xxx.jpg 換成 /cards/thumb/xxx.webp，寬 240。
// 用 srcset 讓瀏覽器依顯示大小與螢幕密度挑：小的用縮圖，放大彈出層（CardZoomDialog）照樣用原圖。
// 後端還沒產生縮圖（404）時：第一次載入失敗就整個停用縮圖，那一張當場換回原圖，不會出現破圖
export const CARD_IMAGE_WIDTH = 500
export const CARD_IMAGE_HEIGHT = 863
const THUMB_WIDTH = 240
const THUMB_DIR = '/cards/thumb/'
const thumbsDisabled = ref(false)

// /cards/cups-01.jpg → /cards/thumb/cups-01.webp；不是塔羅原圖（雷諾曼 SVG、空字串）回傳 ''
export function thumbPathOf(image?: string) {
  const match = image?.match(/^\/cards\/([^/]+)\.(?:jpe?g|png)$/i)
  return match ? `${THUMB_DIR}${match[1]}.webp` : ''
}

// 給 <img :srcset> 用：沒有縮圖可用（像素版、雷諾曼、縮圖已停用）時回傳 undefined，屬性就不會出現
export function cardSrcset(image?: string) {
  if (thumbsDisabled.value || !image) return undefined
  // 像素版是前端畫的圖，沒有縮圖
  const url = cardImageUrl(image)
  if (url !== imageUrl(image)) return undefined
  const thumb = thumbPathOf(image)
  return thumb ? `${imageUrl(thumb)} ${THUMB_WIDTH}w, ${url} ${CARD_IMAGE_WIDTH}w` : undefined
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
