// 台股持股存成「張」（1 張 = 1000 股，零股是小數）；輸入時可以選填張數或股數
export type QuantityUnit = '張' | '股'

const SHARES_PER_LOT = 1000

// 輸入的數字換成要存的數量：台股填股數就除以 1000；美股本來就是股
export function toStoredQuantity(value: number, unit: QuantityUnit, market: 'tw' | 'us'): number {
  if (market !== 'tw' || unit === '張') return value
  // 去掉浮點誤差（例如 0.1 + 0.2 這類），股數最小到 1 股，所以 3 位小數就夠
  return Math.round((value / SHARES_PER_LOT) * 1000) / 1000
}

// 已存的數量轉回編輯用：台股有零股（不是整張）就用股數顯示，比 0.123 張好讀
export function toEditableQuantity(stored: number, market: 'tw' | 'us'): { quantity: string; unit: QuantityUnit } {
  if (market !== 'tw' || Number.isInteger(stored)) return { quantity: String(stored), unit: market === 'tw' ? '張' : '股' }
  return { quantity: String(Math.round(stored * SHARES_PER_LOT * 1000) / 1000), unit: '股' }
}
