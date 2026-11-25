import { describe, expect, it } from 'vitest'

import { parseCardStyle, watercolorImagePath } from './cardStyle'

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
