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
