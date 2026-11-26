import { describe, expect, it, vi } from 'vitest'

// 後端網址前綴固定成 https://api，方便比對
vi.mock('./api', () => ({ imageUrl: (image?: string) => (image ? `https://api${image}` : '') }))

const { cardSrcset, thumbPathOf } = await import('./cardStyle')

describe('牌卡縮圖', () => {
  it('塔羅原圖換成 /cards/thumb/ 底下同名的 webp', () => {
    expect(thumbPathOf('/cards/cups-01.jpg')).toBe('/cards/thumb/cups-01.webp')
    expect(thumbPathOf('/cards/major-00.JPEG')).toBe('/cards/thumb/major-00.webp')
  })

  it('不是塔羅原圖（雷諾曼 SVG、空的、已經是縮圖）沒有縮圖', () => {
    expect(thumbPathOf('/lenormand/01-rider.svg')).toBe('')
    expect(thumbPathOf('')).toBe('')
    expect(thumbPathOf(undefined)).toBe('')
    expect(thumbPathOf('/cards/thumb/cups-01.webp')).toBe('')
  })

  it('srcset：縮圖 240w、原圖 500w；雷諾曼沒有 srcset', () => {
    expect(cardSrcset('/cards/cups-01.jpg')).toBe('https://api/cards/thumb/cups-01.webp 240w, https://api/cards/cups-01.jpg 500w')
    expect(cardSrcset('/lenormand/01-rider.svg')).toBeUndefined()
    expect(cardSrcset(undefined)).toBeUndefined()
  })
})
