// 有沒有在交易：決定要不要自動更新報價、檢查價位提醒（收盤後不打 API）
import { describe, expect, it } from 'vitest'

import { anyMarketOpen, isMarketOpen } from './marketHours'

// 2026-11-19 是星期四、11-21 是星期六
const at = (iso: string) => new Date(iso)

describe('isMarketOpen', () => {
  it('台股：09:00～13:45（含收盤後 15 分鐘緩衝），台北時間', () => {
    expect(isMarketOpen('tw', at('2026-11-19T08:59:00+08:00'))).toBe(false)
    expect(isMarketOpen('tw', at('2026-11-19T09:00:00+08:00'))).toBe(true)
    expect(isMarketOpen('tw', at('2026-11-19T13:44:00+08:00'))).toBe(true)
    expect(isMarketOpen('tw', at('2026-11-19T13:45:00+08:00'))).toBe(false)
  })

  it('美股：紐約 09:30～16:30，冬令時間（11 月）', () => {
    // 紐約 11 月是 UTC-5：09:30 = 14:30Z
    expect(isMarketOpen('us', at('2026-11-19T14:29:00Z'))).toBe(false)
    expect(isMarketOpen('us', at('2026-11-19T14:30:00Z'))).toBe(true)
    expect(isMarketOpen('us', at('2026-11-19T21:29:00Z'))).toBe(true)
    expect(isMarketOpen('us', at('2026-11-19T21:30:00Z'))).toBe(false)
  })

  it('美股夏令時間由時區自動處理（7 月是 UTC-4）', () => {
    expect(isMarketOpen('us', at('2026-07-15T13:30:00Z'))).toBe(true)
    expect(isMarketOpen('us', at('2026-07-15T13:29:00Z'))).toBe(false)
  })

  it('週末不開盤', () => {
    expect(isMarketOpen('tw', at('2026-11-21T10:00:00+08:00'))).toBe(false)
    expect(isMarketOpen('us', at('2026-11-21T15:00:00Z'))).toBe(false)
  })
})

describe('anyMarketOpen', () => {
  it('一組標的裡有一個市場在交易就是 true', () => {
    const twMorning = at('2026-11-19T10:00:00+08:00')
    expect(anyMarketOpen(['us', 'tw'], twMorning)).toBe(true)
    expect(anyMarketOpen(['us'], twMorning)).toBe(false)
    expect(anyMarketOpen([], twMorning)).toBe(false)
  })
})
