import { describe, expect, it } from 'vitest'

import { clearGuestCard, drawnHere, guestCardToday, markPrompted, promptedToday, saveGuestCard, taipeiToday } from './dailyCard'
import type { DailyCardResponse } from '../types'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const RESULT: DailyCardResponse = {
  today: '2026-11-20',
  streak: 0,
  saved: false,
  claim: 'signed-claim',
  dailyCard: {
    date: '2026-11-20',
    orientation: 'reversed',
    card: { id: 'c1', nameZh: '愚人', nameEn: 'The Fool', image: '/cards/fool.png', suit: null, arcanaType: 'major', keywords: [] },
    message: '新的旅程正要開始。',
    advice: '先踏出第一步。',
  },
}

describe('每日一牌的跨頁狀態', () => {
  it('台北的今天：UTC 16:00 已經是台北隔天', () => {
    expect(taipeiToday(new Date('2026-11-19T15:59:00Z'))).toBe('2026-11-19')
    expect(taipeiToday(new Date('2026-11-19T16:00:00Z'))).toBe('2026-11-20')
  })

  it('彈窗一天只跳一次：今天跳過就不再跳，隔天又會跳', () => {
    const store = memoryStore()
    expect(promptedToday('2026-11-20', store)).toBe(false)
    markPrompted('2026-11-20', store)
    expect(promptedToday('2026-11-20', store)).toBe(true)
    expect(promptedToday('2026-11-21', store)).toBe(false)
  })

  it('訪客抽的牌：當天拿得回同一張；隔天就失效並清掉', () => {
    const store = memoryStore()
    saveGuestCard(RESULT, store)
    expect(guestCardToday('2026-11-20', store)?.dailyCard.card.nameZh).toBe('愚人')
    expect(guestCardToday('2026-11-20', store)?.claim).toBe('signed-claim')
    expect(guestCardToday('2026-11-21', store)).toBeNull()
    // 已經被清掉
    expect(guestCardToday('2026-11-20', store)).toBeNull()
  })

  it('沒有領取憑證（會員抽的）不記；壞掉的資料當沒有', () => {
    const store = memoryStore()
    saveGuestCard({ ...RESULT, claim: undefined }, store)
    expect(guestCardToday('2026-11-20', store)).toBeNull()
    store.setItem('tarot.dailyCard.guest', '{壞掉')
    expect(guestCardToday('2026-11-20', store)).toBeNull()
    saveGuestCard(RESULT, store)
    clearGuestCard(store)
    expect(guestCardToday('2026-11-20', store)).toBeNull()
  })

  it('「這個分頁抽的」標記：只認今天的；沒有 sessionStorage 時當成不是這個分頁抽的', () => {
    const tab = memoryStore()
    expect(drawnHere('2026-11-20', tab)).toBe(false)
    tab.setItem('tarot.dailyCard.drawnHere', '2026-11-20')
    expect(drawnHere('2026-11-20', tab)).toBe(true)
    expect(drawnHere('2026-11-21', tab)).toBe(false)
  })
})
