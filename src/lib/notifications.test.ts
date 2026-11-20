import { describe, expect, it } from 'vitest'

import { badgeText, groupNotifications, notificationRoute, notificationTime } from './notifications'
import type { AppNotification } from '../types'

const item = (id: string, createdAt: string): AppNotification => ({ id, kind: 'test', title: id, body: '', url: '', read: false, createdAt })
// 台北 2026-11-20 10:00
const NOW = new Date('2026-11-20T02:00:00Z')

describe('通知中心', () => {
  it('鈴鐺超過 99 顯示 99+', () => {
    expect(badgeText(5)).toBe('5')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('依台北日期分成今天、昨天、更早；沒有的組不出現', () => {
    const list = [
      item('a', '2026-11-20T01:00:00Z'),
      // 台北 11/20 00:30（UTC 還是 11/19）
      item('b', '2026-11-19T16:30:00Z'),
      item('c', '2026-11-19T15:30:00Z'),
      item('d', '2026-11-10T03:00:00Z'),
    ]
    expect(groupNotifications(list, NOW).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['今天', ['a', 'b']],
      ['昨天', ['c']],
      ['更早', ['d']],
    ])
    expect(groupNotifications([item('x', '2026-11-01T00:00:00Z')], NOW).map((g) => g.label)).toEqual(['更早'])
  })

  it('時間：今天、昨天只寫時分，更早加日期；午夜是 00 不是 24', () => {
    expect(notificationTime('2026-11-19T16:05:00Z', NOW)).toBe('00:05')
    expect(notificationTime('2026-11-19T01:00:00Z', NOW)).toBe('09:00')
    expect(notificationTime('2026-11-08T01:05:00Z', NOW)).toBe('11/8 09:05')
  })

  it('站內路徑補上開頭的 /；外部網址不跳', () => {
    expect(notificationRoute('market?tab=alerts')).toBe('/market?tab=alerts')
    expect(notificationRoute('/market')).toBe('/market')
    expect(notificationRoute('')).toBeNull()
    expect(notificationRoute('https://evil.example')).toBeNull()
  })
})
