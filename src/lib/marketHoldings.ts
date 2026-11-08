// 持股加總：自訂股票追蹤的持股總覽與股市總覽的「我的持股總覽」共用，兩邊的數字才不會對不上。
// 每檔的損益由後端算好（item.position）；這裡只把同一個市場的加起來（台股、美股幣別不同，分開）
import type { MarketPosition, MarketWatchItem } from '../types'

export interface HoldingTotal {
  market: 'tw' | 'us'
  currency: 'TWD' | 'USD'
  // 目前還有持股的檔數
  count: number
  value: number
  cost: number
  pnl: number
  pnlPct: number
  realized: number
  dividends: number
  // 今日損益；報價沒有今日漲跌時為 null
  today: number | null
}

export function holdingTotals(items: MarketWatchItem[]): HoldingTotal[] {
  return (['tw', 'us'] as const)
    .map((market) => {
      const positions = items.filter((item) => item.target.market === market && item.position).map((item) => item.position as MarketPosition)
      if (positions.length === 0) return null
      const held = positions.filter((p) => p.quantity > 0 && p.marketValue !== null)
      const sum = (list: MarketPosition[], pick: (p: MarketPosition) => number | null) => list.reduce((acc, p) => acc + (pick(p) ?? 0), 0)
      const value = sum(held, (p) => p.marketValue)
      const cost = sum(held, (p) => p.costBasis)
      const pnl = sum(held, (p) => p.unrealized)
      const todays = held.map((p) => p.today).filter((t): t is number => t !== null)
      const total: HoldingTotal = {
        market,
        currency: market === 'tw' ? 'TWD' : 'USD',
        count: held.length,
        value,
        cost,
        pnl,
        pnlPct: cost ? (pnl / cost) * 100 : 0,
        realized: sum(positions, (p) => p.realized),
        dividends: sum(positions, (p) => p.dividends),
        today: todays.length ? todays.reduce((a, b) => a + b, 0) : null,
      }
      return total
    })
    .filter((total): total is HoldingTotal => total !== null)
}
