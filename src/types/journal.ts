// 每日一牌與月曆（v26 計畫 1）、占卜日記（v26 計畫 2）、通知中心（v26 計畫 5）
import type { MarketAlertTarget } from './marketTrack'

// ---- 每日一牌與月曆（v26 計畫 1）----

export interface DailyCard {
  // 台北時間的日期 YYYY-MM-DD
  date: string
  orientation: 'upright' | 'reversed'
  card: {
    id: string
    nameZh: string
    nameEn: string
    image: string
    suit: string | null
    arcanaType: string | null
    keywords: string[]
  }
  // 牌義「核心訊息」與「行動建議」的第一句，文字由後端給
  message: string
  advice: string
}

export interface DailyCardResponse {
  today: string
  dailyCard: DailyCard | null
  streak: number
  // 抽牌時才有：登入的存起來（saved），今天已經抽過（alreadyDrawn）
  saved?: boolean
  alreadyDrawn?: boolean
  // 訪客抽牌時才有：登入或註冊後用它把這張存進月曆（伺服器簽的，前端不能改）
  claim?: string
  // 領取時才有：true 表示這次存進去了；false 表示今天早就抽過，以已存的為準
  claimed?: boolean
}

export interface CalendarReading {
  id: string
  question: string
  spreadName: string
  createdAt: string
  // 「愚人逆」這種牌名＋正逆位；雷諾曼是中文牌名（沒有正逆位）
  cards: string[]
  // 哪一套牌（v27 3-10）：雷諾曼的紀錄連到雷諾曼紀錄；舊版後端沒有這個欄位，一律當塔羅
  deck?: 'tarot' | 'lenormand'
}

// ---- 占卜日記（v26 計畫 2）----
// Tiptap 的 JSON（後端驗證節點白名單）
export interface JournalContent {
  type: string
  attrs?: Record<string, unknown>
  content?: JournalContent[]
  text?: string
  marks?: { type: string }[]
}

// 結果標記：應驗了／部分應驗／沒有應驗；null＝還不知道
export type JournalOutcome = 'hit' | 'partial' | 'miss' | null

// 股票日記每篇可選填的「記錄股票」（v26 計畫 2-2、D8）：只是紀錄，不會改股市追蹤的持股
// 觀察／買進／加碼／減碼／賣出／停損
export type JournalStockAction = 'watch' | 'buy' | 'add' | 'reduce' | 'sell' | 'stop'
export interface JournalStockRecord {
  action: JournalStockAction | null
  price: number | null
  // 台股可以填張或股（unit），美股一律是股
  quantity: number | null
  unit: 'share' | 'lot' | null
  // 寫的時候的股價（開日記時帶入的最新股價）
  quoteAtWrite: number | null
  quoteDate: string | null
  targetPrice: number | null
  stopPrice: number | null
}

// 股票日記頁的這檔股票：名稱與最新股價（GET /api/market/stock-journal）
export interface StockJournalInfo {
  // tw:0050、us:NVDA
  key: string
  target: MarketAlertTarget
  // 有沒有在股市追蹤裡
  tracked: boolean
  // 查不到時 null（頁面照樣能寫）
  quote: { price: number; time: string | null } | null
}

export interface JournalEntry {
  id: string
  // reading:<紀錄 id> 或 stock:<市場>:<代號>（一檔股票一本，v26 計畫 2-2；每日一牌的日記 2026-11-20 拿掉）
  target: string
  // 只有股票日記有；舊版後端沒有
  stock?: JournalStockRecord | null
  // 標題（2026-11-20 加，舊版後端沒有）
  title?: string
  content: JournalContent
  // 純文字摘要（最多 200 字）
  text: string
  outcome: JournalOutcome
  // 這篇記的是哪一天（台北時間）
  entryDate: string
  createdAt: string
  updatedAt: string
}

// 月曆上當天寫的日記摘要
export interface CalendarJournal {
  id: string
  target: string
  title?: string
  text: string
  outcome: JournalOutcome
}

export interface CalendarDay {
  date: string
  // detail：和今天的牌同一個格式（點月曆上的牌開小彈窗用）；舊版後端沒有
  dailyCard: { nameZh: string; image: string; orientation: 'upright' | 'reversed'; detail?: DailyCard } | null
  readings: CalendarReading[]
  // 當天寫的日記（v26 計畫 2）；舊版後端沒有
  journals?: CalendarJournal[]
}

export interface CalendarMonth {
  month: string
  today: string
  streak: number
  days: CalendarDay[]
}

// 通知中心（v26 計畫 5）：價位提醒、除息前提醒、測試推播都留一份，錯過也找得回來。
// url 是站內路徑、不含開頭的 /（例如 market?tab=alerts），和推播同一種寫法
export type AppNotificationKind = 'price-alert' | 'ex-dividend' | 'test' | 'system'

export interface AppNotification {
  id: string
  kind: AppNotificationKind
  title: string
  body: string
  url: string
  read: boolean
  createdAt: string
}
