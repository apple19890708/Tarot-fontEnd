// 台股持股存成「張」，輸入可以填張或股；美股一律是股
import { describe, expect, it } from 'vitest'

import { toEditableQuantity, toStoredQuantity } from './quantityUnit'

describe('toStoredQuantity', () => {
  it('台股填股數換成張（零股是小數），去掉浮點誤差', () => {
    expect(toStoredQuantity(1500, '股', 'tw')).toBe(1.5)
    expect(toStoredQuantity(123, '股', 'tw')).toBe(0.123)
    expect(toStoredQuantity(300, '股', 'tw')).toBe(0.3)
  })

  it('台股填張數、美股不換算', () => {
    expect(toStoredQuantity(2, '張', 'tw')).toBe(2)
    expect(toStoredQuantity(15, '股', 'us')).toBe(15)
  })
})

describe('toEditableQuantity', () => {
  it('台股整張用張、有零股用股數顯示', () => {
    expect(toEditableQuantity(3, 'tw')).toEqual({ quantity: '3', unit: '張' })
    expect(toEditableQuantity(0.123, 'tw')).toEqual({ quantity: '123', unit: '股' })
    expect(toEditableQuantity(1.5, 'tw')).toEqual({ quantity: '1500', unit: '股' })
  })

  it('美股一律是股（含小數股）', () => {
    expect(toEditableQuantity(2.5, 'us')).toEqual({ quantity: '2.5', unit: '股' })
  })

  it('存進去再取出來數量不變', () => {
    for (const shares of [1, 99, 1000, 1234, 25_000]) {
      const stored = toStoredQuantity(shares, '股', 'tw')
      const editable = toEditableQuantity(stored, 'tw')
      const back = editable.unit === '張' ? Number(editable.quantity) * 1000 : Number(editable.quantity)
      expect(back).toBe(shares)
    }
  })
})
