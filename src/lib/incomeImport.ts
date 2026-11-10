// 應收股利「帶入」（v20 階段 4）：把後端算好的應收股利寫進這一檔的紀錄。
// 金額、股數都直接用後端算的（net、addQuantity），這裡只負責放到紀錄的哪個位置，不重算。
import type { IncomeEntitlementEvent, IncomeItem, MarketDividend, MarketTrade } from '../types'

// 台股股利取整數元，美股到分
function roundAmount(value: number, market: 'tw' | 'us') {
  return market === 'tw' ? Math.round(value) : Math.round(value * 100) / 100
}

// 帶入幾筆應收：現金股利加進 dividends（入帳日先填除息日，實際入帳日可以之後改）；
// 配股插進 trades 裡日期對的位置：除權日當天的買賣之前（除權日當天才賣光也領得到配股；排在賣出後面的話，
// 後端「配股之前要有持股」的檢查會擋下來）。
// 回傳要送給 updateWatchHoldings 的內容；沒變動的那一項不送，避免整批改寫
export function entitlementPatch(item: IncomeItem, events: IncomeEntitlementEvent[]) {
  const patch: { trades?: MarketTrade[]; dividends?: MarketDividend[] } = {}
  const sorted = [...events].sort((a, b) => a.exDate.localeCompare(b.exDate))

  const cash = sorted.filter((e) => e.type === 'cash' && e.net !== null && e.net !== undefined && e.net > 0)
  if (cash.length) {
    patch.dividends = [
      ...(item.dividends ?? []),
      ...cash.map((e) => ({ amount: roundAmount(e.net!, item.target.market), date: e.exDate, exDate: e.exDate })),
    ]
  }

  const stock = sorted.filter((e) => e.type === 'stock' && (e.addQuantity ?? 0) > 0)
  if (stock.length) {
    const trades = [...(item.trades ?? [])]
    for (const e of stock) {
      // 應收股利只在每筆買賣都有日期時才算得出來，所以這裡的 date 都有值
      const at = trades.findIndex((t) => (t.date ?? '') >= e.exDate)
      const trade: MarketTrade = { side: 'stockDividend', quantity: e.addQuantity!, price: 0, date: e.exDate }
      if (at < 0) trades.push(trade)
      else trades.splice(at, 0, trade)
    }
    patch.trades = trades
  }
  return patch
}

// 「是同一筆」：手動記過的那筆股利補上除息日，之後就認得是這一次，不會再要你帶入
export function linkDividendPatch(item: IncomeItem, event: IncomeEntitlementEvent) {
  const index = event.matchIndex
  const dividends = item.dividends ?? []
  if (index === null || index === undefined || !dividends[index]) return null
  return { dividends: dividends.map((d, i) => (i === index ? { ...d, exDate: event.exDate } : d)) }
}
