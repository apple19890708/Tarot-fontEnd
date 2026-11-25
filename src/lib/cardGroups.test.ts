import { describe, expect, it } from 'vitest'

import { lenormandCardGroups, tarotCardGroups } from './cardGroups'
import type { CardSummary, LenormandDrawCard } from '../types'

const tarot = (patch: Partial<CardSummary>): CardSummary => ({
  id: patch.nameZh ?? 'x',
  nameZh: 'x',
  nameEn: 'x',
  suit: null,
  arcanaType: 'minor',
  number: 1,
  image: '',
  ...patch,
})

const lenormand = (number: number, nameZh: string, nameEn: string): LenormandDrawCard => ({
  id: String(number),
  number,
  nameZh,
  nameEn,
  image: '',
})

describe('tarotCardGroups', () => {
  const cards = [
    tarot({ nameZh: '愚者', nameEn: 'The Fool', arcanaType: 'major', number: 0 }),
    tarot({ nameZh: '權杖一', nameEn: 'Ace of Wands', suit: 'wands', number: 1, kind: 'pip' }),
    tarot({ nameZh: '權杖侍者', nameEn: 'Page of Wands', suit: 'wands', number: 11, kind: 'court' }),
  ]

  it('大牌一組、花色的數字牌與宮廷牌分兩排，空的排與組不出現', () => {
    const groups = tarotCardGroups(cards, '')
    expect(groups.map((group) => group.key)).toEqual(['major', 'wands'])
    expect(groups[0]!.rows.map((row) => row.key)).toEqual(['cards'])
    expect(groups[1]!.rows.map((row) => [row.key, row.cards.map((card) => card.nameZh)])).toEqual([
      ['cards', ['權杖一']],
      ['courts', ['權杖侍者']],
    ])
  })

  it('搜尋比對中英文牌名', () => {
    expect(tarotCardGroups(cards, 'page').flatMap((group) => group.rows.flatMap((row) => row.cards.map((card) => card.nameZh)))).toEqual(['權杖侍者'])
  })
})

describe('lenormandCardGroups', () => {
  const cards = [lenormand(37, '月桂', 'Laurel'), lenormand(3, '船', 'Ship'), lenormand(13, '孩童', 'Child'), lenormand(1, '騎士', 'Rider')]

  it('1～36 與 37～52 分兩組，組內依牌號排序', () => {
    const groups = lenormandCardGroups(cards, '')
    expect(groups.map((group) => [group.key, group.rows[0]!.cards.map((card) => card.number)])).toEqual([
      ['traditional', [1, 3, 13]],
      ['extended', [37]],
    ])
  })

  it('純數字只比對牌號，不會把 13 也找出來', () => {
    expect(lenormandCardGroups(cards, '3').flatMap((group) => group.rows[0]!.cards.map((card) => card.number))).toEqual([3])
  })

  it('文字比對中英文牌名，沒有符合的組不出現', () => {
    const groups = lenormandCardGroups(cards, 'ship')
    expect(groups.map((group) => group.key)).toEqual(['traditional'])
    expect(lenormandCardGroups(cards, '月').map((group) => group.key)).toEqual(['extended'])
  })
})
