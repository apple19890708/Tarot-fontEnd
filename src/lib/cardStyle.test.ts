import { describe, expect, it, vi } from 'vitest'

// 後端網址前綴固定成 https://api，方便比對
vi.mock('./api', () => ({ imageUrl: (image?: string) => (image ? `https://api${image}` : '') }))

const { cardImageUrl, cardSrcset, parseCardStyle, setCardStyle, thumbPathOf, watercolorImagePath } = await import('./cardStyle')

describe('watercolorImagePath', () => {
  it('塔羅原版 jpg 換成同名 svg', () => {
    expect(watercolorImagePath('/cards/major-00-fool.jpg')).toBe('/cards/major-00-fool.svg')
    expect(watercolorImagePath('/cards/pentacles-14.jpg')).toBe('/cards/pentacles-14.svg')
  })

  it('已經是 svg、雷諾曼、其他路徑原樣回傳', () => {
    expect(watercolorImagePath('/cards/cups-03.svg')).toBe('/cards/cups-03.svg')
    expect(watercolorImagePath('/lenormand/01-rider.svg')).toBe('/lenormand/01-rider.svg')
    expect(watercolorImagePath('/cards/fool.png')).toBe('/cards/fool.png')
    expect(watercolorImagePath('https://example.com/cards/x.jpg')).toBe('https://example.com/cards/x.jpg')
  })
})

describe('parseCardStyle', () => {
  it('舊的像素版設定當成水彩版，其他一律原版', () => {
    expect(parseCardStyle('watercolor')).toBe('watercolor')
    expect(parseCardStyle('pixel')).toBe('watercolor')
    expect(parseCardStyle('original')).toBe('original')
    expect(parseCardStyle(null)).toBe('original')
    expect(parseCardStyle('xyz')).toBe('original')
  })
})

describe('牌卡縮圖', () => {
  it('塔羅原版 jpg 換成 /cards/thumb/ 底下同名的 webp', () => {
    expect(thumbPathOf('/cards/cups-01.jpg')).toBe('/cards/thumb/cups-01.webp')
    expect(thumbPathOf('/cards/major-00.JPEG')).toBe('/cards/thumb/major-00.webp')
  })

  it('不是原版 jpg（水彩 SVG、雷諾曼 SVG、空的、已經是縮圖）沒有縮圖', () => {
    expect(thumbPathOf('/cards/cups-01.svg')).toBe('')
    expect(thumbPathOf('/lenormand/01-rider.svg')).toBe('')
    expect(thumbPathOf('')).toBe('')
    expect(thumbPathOf(undefined)).toBe('')
    expect(thumbPathOf('/cards/thumb/cups-01.webp')).toBe('')
  })

  it('原版：srcset 是縮圖 240w、原圖 500w；雷諾曼沒有 srcset', () => {
    setCardStyle('original')
    expect(cardSrcset('/cards/cups-01.jpg')).toBe('https://api/cards/thumb/cups-01.webp 240w, https://api/cards/cups-01.jpg 500w')
    expect(cardSrcset('/lenormand/01-rider.svg')).toBeUndefined()
    expect(cardSrcset(undefined)).toBeUndefined()
  })

  it('水彩版：直接用 SVG，沒有縮圖；雷諾曼不受牌面風格影響', () => {
    setCardStyle('watercolor')
    expect(cardImageUrl('/cards/cups-01.jpg')).toBe('https://api/cards/cups-01.svg')
    expect(cardSrcset('/cards/cups-01.jpg')).toBeUndefined()
    expect(cardImageUrl('/lenormand/01-rider.svg')).toBe('https://api/lenormand/01-rider.svg')
    setCardStyle('original')
  })
})
