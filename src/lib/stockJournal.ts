// 股票日記（v26 計畫 2-2，計畫書在後端 doc/v26-daily-card-journal-plan.md）：一檔股票一本日記。
// 股票鍵 <市場>:<代號>：台股用代號（tw:0050），美股與指數用 symbol（us:NVDA、tw:^TWII），和後端 services/stockJournal.js 同一套。
// 每篇可選填「記錄股票」：動作、價格、數量、寫的時候的股價、目標價、停損價（只是紀錄，不改股市追蹤的持股）
import type { JournalStockAction, JournalStockRecord, MarketAlertTarget } from '../types'

export const STOCK_ACTION_OPTIONS: { value: JournalStockAction; label: string }[] = [
  { value: 'watch', label: '觀察' },
  { value: 'buy', label: '買進' },
  { value: 'add', label: '加碼' },
  { value: 'reduce', label: '減碼' },
  { value: 'sell', label: '賣出' },
  { value: 'stop', label: '停損' },
]

// 每個動作要填的欄位（2026-11-20 使用者回報：不管動作都顯示停損價不合理）。
// 觀察還沒買，只記看好的目標價；買進、加碼記成交價與數量，加上目標價、停損價；減碼、賣出、停損是出場，只記成交價與數量。
// 沒選動作就不顯示價格欄位
export type StockNumberField = 'price' | 'quantity' | 'targetPrice' | 'stopPrice'
const ACTION_FIELDS: Record<JournalStockAction, StockNumberField[]> = {
  watch: ['targetPrice'],
  buy: ['price', 'quantity', 'targetPrice', 'stopPrice'],
  add: ['price', 'quantity', 'targetPrice', 'stopPrice'],
  reduce: ['price', 'quantity'],
  sell: ['price', 'quantity'],
  stop: ['price', 'quantity'],
}
export function stockFieldsOf(action: JournalStockAction | null | undefined): StockNumberField[] {
  return action ? ACTION_FIELDS[action] : []
}
export const STOCK_FIELD_LABELS: Record<StockNumberField, string> = { price: '價格', quantity: '數量', targetPrice: '目標價', stopPrice: '停損價' }

export function stockActionLabel(value: JournalStockAction | null | undefined) {
  return STOCK_ACTION_OPTIONS.find((option) => option.value === value)?.label ?? ''
}

const ID_PATTERN = /^[A-Z0-9^.=-]{1,16}$/

// 分析紀錄或追蹤項目的 target → 股票鍵；資料不完整時 null。
// 指數用 symbol（加權 code 't00'＋'^TWII'），沒有 symbol 才用代號（櫃買 'o00'）。後端的分析紀錄會直接回 stockKey，有就用它
export function stockKeyOf(target: (Pick<MarketAlertTarget, 'market' | 'code' | 'symbol'> & { kind?: string }) | null | undefined): string | null {
  if (!target || (target.market !== 'tw' && target.market !== 'us')) return null
  const raw = target.kind === 'index' ? target.symbol || target.code : target.market === 'tw' && target.code ? target.code : target.symbol
  const id = String(raw ?? '').trim().toUpperCase()
  return ID_PATTERN.test(id) ? `${target.market}:${id}` : null
}

// 網址的 /journal/stock/<市場>/<代號> → 股票鍵；不合格式 null
export function stockKeyFromRoute(market: unknown, code: unknown): string | null {
  const m = String(market ?? '').toLowerCase()
  const id = String(code ?? '').trim().toUpperCase()
  if ((m !== 'tw' && m !== 'us') || !ID_PATTERN.test(id)) return null
  return `${m}:${id}`
}

// 股票日記頁的網址（^TWII 這類要編碼）
export function stockJournalPath(stockKey: string) {
  const index = stockKey.indexOf(':')
  return `/journal/stock/${stockKey.slice(0, index)}/${encodeURIComponent(stockKey.slice(index + 1))}`
}

// 日記對象（reading:<id>、stock:tw:0050）→ 日記頁網址。舊的 stock:<分析 id> 交給日記頁轉成新網址
export function journalPathOf(target: string) {
  if (target.startsWith('stock:')) {
    const rest = target.slice('stock:'.length)
    return rest.includes(':') ? stockJournalPath(rest) : `/journal/stock/${rest}`
  }
  const index = target.indexOf(':')
  return `/journal/${target.slice(0, index)}/${target.slice(index + 1)}`
}

// ---- 編輯用的草稿（輸入框都是字串）----
export interface StockDraft {
  action: JournalStockAction | null
  price: string
  quantity: string
  unit: 'share' | 'lot'
  quoteAtWrite: number | null
  quoteDate: string | null
  targetPrice: string
  stopPrice: string
}

const toText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))

// 新的一篇：帶入現在的股價（寫的時候的股價）；台股預設以「張」填
export function newStockDraft(market: 'tw' | 'us', quote: { price: number; date: string | null } | null): StockDraft {
  return {
    action: null,
    price: '',
    quantity: '',
    unit: market === 'tw' ? 'lot' : 'share',
    quoteAtWrite: quote?.price ?? null,
    quoteDate: quote?.date ?? null,
    targetPrice: '',
    stopPrice: '',
  }
}

// 改舊的一篇：沿用當時存的（寫的時候的股價不換成現在的）
export function stockDraftOf(record: JournalStockRecord | null | undefined, market: 'tw' | 'us'): StockDraft {
  if (!record) return { ...newStockDraft(market, null) }
  return {
    action: record.action,
    price: toText(record.price),
    quantity: toText(record.quantity),
    unit: record.unit ?? (market === 'tw' ? 'lot' : 'share'),
    quoteAtWrite: record.quoteAtWrite,
    quoteDate: record.quoteDate,
    targetPrice: toText(record.targetPrice),
    stopPrice: toText(record.stopPrice),
  }
}

// 草稿 → 送給後端的欄位；有填錯回錯誤（訊息給使用者看）。沒選動作回 null。
// 只送這個動作用得到的欄位：先選買進填了停損價、再改成賣出，藏起來的停損價不會被存進去
export function stockRecordOf(draft: StockDraft, market: 'tw' | 'us'): { value: JournalStockRecord | null } | { error: string } {
  if (!draft.action) return { value: null }
  const numbers: Record<StockNumberField, number | null> = { price: null, quantity: null, targetPrice: null, stopPrice: null }
  for (const key of stockFieldsOf(draft.action)) {
    const text = draft[key].replace(/,/g, '').trim()
    if (!text) continue
    const value = Number(text)
    if (!Number.isFinite(value) || value <= 0) return { error: `${STOCK_FIELD_LABELS[key]}要填大於 0 的數字。` }
    numbers[key] = value
  }
  return {
    value: {
      action: draft.action,
      ...numbers,
      // 沒填數量時單位沒有意義；美股一律是股
      unit: numbers.quantity === null ? null : market === 'us' ? 'share' : draft.unit,
      quoteAtWrite: draft.quoteAtWrite,
      quoteDate: draft.quoteDate,
    },
  }
}

// 列表與滿版看的欄位：照動作挑欄位、沒填的略過（舊資料多存的欄位也不顯示）。
// 例：買進 → [價格 995、數量 1 張、目標價 1,200、停損價 930]
export function stockRows(record: JournalStockRecord | null | undefined): { label: string; value: string }[] {
  if (!record) return []
  return stockFieldsOf(record.action).flatMap((key) => {
    const value = record[key]
    if (value === null || value === undefined) return []
    return [{ label: STOCK_FIELD_LABELS[key], value: key === 'quantity' ? quantityText(record) : value.toLocaleString('zh-TW') }]
  })
}

// 有沒有記錄股票（列表顯示用）：欄位跟著動作，沒選動作就等於沒記
export function hasStockRecord(record: JournalStockRecord | null | undefined): record is JournalStockRecord {
  return Boolean(record?.action)
}

// 數量的文字：2 張、500 股
export function quantityText(record: Pick<JournalStockRecord, 'quantity' | 'unit'>) {
  if (record.quantity === null) return ''
  return `${record.quantity.toLocaleString('zh-TW')} ${record.unit === 'lot' ? '張' : '股'}`
}

// 寫的時候到現在漲跌幾 %（小數一位）；任一個沒有就 null
export function changeSincePct(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || to === null || to === undefined || !Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round(((to - from) / from) * 1000) / 10
}
