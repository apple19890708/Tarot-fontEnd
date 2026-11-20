import { describe, expect, it } from 'vitest'

import { cardShortName, dayKeyOf, dayTitle, monthKeyOf, timeOf, visibleMonthOf } from './calendarDays'

describe('月曆的日期小工具', () => {
  it('本地日期轉字串只取年月日，不換成 UTC', () => {
    // 本地 11/3 凌晨 1 點：用 toISOString 在 UTC+8 會變成 11/2，這裡要維持 11/3
    const date = new Date(2026, 10, 3, 1, 0)
    expect(dayKeyOf(date)).toBe('2026-11-03')
    expect(monthKeyOf(date)).toBe('2026-11')
  })

  it('月曆畫面從上個月底開始時，主要月份取範圍中間', () => {
    // 2026 年 11 月的月檢視：10/25（日）到 12/6
    expect(visibleMonthOf(new Date(2026, 9, 25), new Date(2026, 11, 6))).toBe('2026-11')
    expect(visibleMonthOf(new Date(2026, 11, 27), new Date(2027, 1, 7))).toBe('2027-01')
  })

  it('日期標題：今天加「今天．」，星期照實際日期', () => {
    expect(dayTitle('2026-11-03')).toBe('11 月 3 日（二）')
    expect(dayTitle('2026-11-20', '2026-11-20')).toBe('今天．11 月 20 日（五）')
  })

  it('紀錄時間用台北時間顯示', () => {
    expect(timeOf('2026-11-03T06:05:00Z')).toBe('14:05')
  })
})

describe('月曆格子的牌名簡寫', () => {
  it('小牌：花色一個字＋點數，王牌是 1', () => {
    expect(cardShortName('權杖二', 'upright')).toBe('杖2')
    expect(cardShortName('聖杯王牌', 'upright')).toBe('杯1')
    expect(cardShortName('寶劍十', 'reversed')).toBe('劍10逆')
  })
  it('宮廷牌：花色＋侍／騎／后／王', () => {
    expect(cardShortName('錢幣皇后', 'reversed')).toBe('幣后逆')
    expect(cardShortName('權杖侍者', 'upright')).toBe('杖侍')
    expect(cardShortName('聖杯國王', 'upright')).toBe('杯王')
  })
  it('大牌照原名，命運之輪縮成命運；皇后、國王這類大牌不會被當成宮廷牌', () => {
    expect(cardShortName('審判', 'upright')).toBe('審判')
    expect(cardShortName('命運之輪', 'reversed')).toBe('命運逆')
    expect(cardShortName('皇后', 'upright')).toBe('皇后')
  })
})

