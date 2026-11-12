import type { ReadingResponse, Spread } from '../types'

// 結果頁排列圖用的完整牌陣定義。結果本身只帶牌陣的 key，一般牌陣用 key 從牌陣清單查回來；
// 自選牌（manual）、自訂位置（custom）不在清單裡，以前查不到就整塊不顯示（2026-11-12 使用者回報「預覽的牌陣不見了」），
// 改用這次抽到的牌組一個：有自訂位置用位置名稱，沒有就是「第 N 張」；一排最多 5 張，多的換到下一排
const ROW_MAX = 5

export function spreadForReading(spreads: Spread[], reading: ReadingResponse | null | undefined): Spread | null {
  if (!reading) return null
  const found = spreads.find((spread) => spread.key === reading.spread.key)
  if (found) return found
  const count = reading.cards.length
  if (!count) return null
  const cols = Math.min(count, ROW_MAX)
  return {
    key: reading.spread.key,
    name: reading.spread.name,
    cardCount: count,
    description: reading.spread.description,
    grid: { cols, rows: Math.ceil(count / ROW_MAX) },
    positions: reading.cards.map((entry, index) => ({
      key: entry.position?.key || `card-${index + 1}`,
      label: entry.position?.label || `第 ${index + 1} 張`,
      prompt: entry.position?.prompt || reading.spread.description || '你自己挑選的牌',
      layout: { col: (index % ROW_MAX) + 1, row: Math.floor(index / ROW_MAX) + 1 },
    })),
  }
}
