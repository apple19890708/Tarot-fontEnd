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

// 牌面圖片網址：像素版對得上就用像素圖，否則用後端的原圖
export function cardImageUrl(image?: string) {
  if (!image) return ''
  if (cardStyle.value === 'pixel' && pixelUrlOf.value) {
    const url = pixelUrlOf.value(image)
    if (url) return url
  }
  return imageUrl(image)
}
