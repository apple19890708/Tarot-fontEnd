import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import type { CardSummary, Spread } from '../types'

const CARDS = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `牌${i}` })) as unknown as CardSummary[]
vi.mock('./api', () => ({ fetchCards: vi.fn(async () => CARDS) }))

const { useDrawState } = await import('./useDrawState')

function setup(count = 3, spread: Spread | null = null) {
  const targetCount = ref(count)
  const selectedSpread = ref<Spread | null>(spread)
  return { targetCount, selectedSpread, draw: useDrawState({ targetCount: computed(() => targetCount.value), selectedSpread }) }
}

describe('抽牌狀態', () => {
  it('手動：第一次進來載牌庫並洗牌，每張都有正逆位；選滿就不能再選，可以退回', async () => {
    const { draw } = setup(2)
    await draw.setDrawMode('fan')
    expect(draw.deck.value).toHaveLength(10)
    expect(draw.deck.value.every((card) => card.orientation === 'upright' || card.orientation === 'reversed')).toBe(true)
    draw.pickFromDeck(0)
    draw.pickFromDeck(0) // 同一張不能選兩次
    draw.pickFromDeck(1)
    draw.pickFromDeck(2) // 已經選滿
    expect(draw.picked.value.map((card) => card.id)).toEqual([draw.deck.value[0]!.id, draw.deck.value[1]!.id])
    expect(draw.sceneDrawn.value).toHaveLength(2)
    draw.undoPick()
    expect(draw.picked.value).toHaveLength(1)
    expect(draw.deck.value[1]!.picked).toBe(false)
  })

  it('輸入：長度跟著張數；同一張放到別的位置會從原位置移走；拖曳是兩張互換', async () => {
    const { draw, targetCount } = setup(3)
    expect(draw.inputCards.value).toHaveLength(3)
    draw.setInputCard(0, CARDS[0]!)
    draw.setInputCard(2, CARDS[1]!)
    draw.setInputCard(1, CARDS[0]!)
    expect(draw.inputCards.value.map((card) => card?.id)).toEqual([undefined, 'c0', 'c1'])
    draw.reorderInputCards(1, 2)
    expect(draw.inputCards.value.map((card) => card?.id)).toEqual([undefined, 'c1', 'c0'])
    draw.toggleInputOrientation(1)
    expect(draw.inputCards.value[1]!.orientation).toBe('reversed')
    // 張數變少截短、變多補空位，已放的留著
    targetCount.value = 2
    await nextTick()
    expect(draw.inputCards.value.map((card) => card?.id)).toEqual([undefined, 'c1'])
    targetCount.value = 4
    await nextTick()
    expect(draw.inputCards.value).toHaveLength(4)
    expect(draw.inputCards.value[1]?.id).toBe('c1')
  })

  it('自訂位置：每一格都有名稱才送；有牌陣時不送', () => {
    const { draw, selectedSpread } = setup(2)
    expect(draw.customPositionsParam.value).toBeUndefined()
    draw.updateCustomPosition(0, { label: ' 過去 ' })
    expect(draw.customPositionsParam.value).toBeUndefined()
    draw.updateCustomPosition(1, { label: '現在', prompt: ' 現況 ' })
    expect(draw.customPositionsParam.value).toEqual([
      { label: '過去', prompt: '' },
      { label: '現在', prompt: '現況' },
    ])
    selectedSpread.value = { key: 'timeline', cardCount: 3 } as Spread
    expect(draw.customPositionsParam.value).toBeUndefined()
  })

  it('清掉選的牌連牌堆一起清；再進手動會重新洗牌（重新整理還原後沒有牌庫也一樣）', async () => {
    const { draw } = setup(1)
    await draw.setDrawMode('fan')
    draw.pickFromDeck(0)
    draw.clearPicks()
    expect(draw.picked.value).toEqual([])
    expect(draw.deck.value).toEqual([])
    await draw.setDrawMode('fan')
    expect(draw.deck.value).toHaveLength(10)
  })

  it('還沒載過牌庫就洗牌：牌堆是空的（重抽要先走 setDrawMode）', () => {
    const { draw } = setup(1)
    draw.shuffleDeck()
    expect(draw.deck.value).toEqual([])
  })
})
