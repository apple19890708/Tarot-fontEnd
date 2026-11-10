// 台股／美股現在有沒有在交易：給「自動更新報價」「價位提醒檢查」決定要不要打 API。
// 收盤後價格不會再變，照打只是浪費伺服器（Cloud Run 依請求時間計費）；收盤後的提醒由後端 market-cron 排程檢查。
// 不處理國定假日：假日只會多打幾次，不會漏掉。收盤後多留一段緩衝，等最後一筆成交與延遲報價（Yahoo 約 15～20 分鐘）進來。
export type TradingMarket = 'tw' | 'us'

const SESSIONS: Record<TradingMarket, { timeZone: string; open: number; close: number }> = {
  // 09:00～13:30，緩衝到 13:45
  tw: { timeZone: 'Asia/Taipei', open: 9 * 60, close: 13 * 60 + 45 },
  // 09:30～16:00（紐約時間，夏令時間由時區自動處理），緩衝到 16:30
  us: { timeZone: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 + 30 },
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function partsIn(timeZone: string, date: Date) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    formatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]))
  return { weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

export function isMarketOpen(market: TradingMarket, date = new Date()) {
  const session = SESSIONS[market]
  const { weekday, minutes } = partsIn(session.timeZone, date)
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return minutes >= session.open && minutes < session.close
}

// 一組標的裡只要有一個市場在交易就回 true
export function anyMarketOpen(markets: Iterable<TradingMarket>, date = new Date()) {
  for (const market of new Set(markets)) {
    if (isMarketOpen(market, date)) return true
  }
  return false
}
